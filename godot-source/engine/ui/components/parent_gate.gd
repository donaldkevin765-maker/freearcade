extends CanvasLayer
## ParentGate — adult verification dialog for kids (3+) games.
## Shows a simple math problem. If solved correctly, ads are allowed for 30 min.
## If skipped, the game launches without ads (respecting privacy: a kid can play
## without tracking, they just won't see personalized ads).
##
## Signals:
##   parent_approved() — adult confirmed; show ads for this session
##   skipped() — playing without ads (no consent)

signal parent_approved()
signal skipped()

const MAX_ATTEMPTS: int = 3
const COOLDOWN_SECONDS: float = 300.0  # 5 min lock after too many fails

var _a: int
var _b: int
var _correct: int
var _operator: String
var _attempts: int = 0
var _lockout_until: float = 0.0

@onready var overlay: ColorRect = ColorRect.new()
@onready var problem_label: Label = Label.new()
@onready var input: LineEdit = LineEdit.new()
@onready var feedback: Label = Label.new()
@onready var submit_btn: Button = Button.new()
@onready var skip_btn: Button = Button.new()

func _ready() -> void:
	_generate_problem()
	_build_ui()
	# Check if still in lockout from a previous gate this session
	if GameSession.parent_approved:
		parent_approved.emit()
		queue_free()
		return

func _generate_problem() -> void:
	if randf() < 0.5:
		# Addition
		_a = randi_range(10, 50)
		_b = randi_range(10, 50)
		_correct = _a + _b
		_operator = "+"
	else:
		# Subtraction (ensure non-negative result)
		_a = randi_range(20, 99)
		_b = randi_range(1, _a - 1)
		_correct = _a - _b
		_operator = "-"

func _build_ui() -> void:
	# Overlay
	overlay.color = Color(0.0, 0.0, 0.0, 0.7)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	overlay.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(overlay)

	# Dialog panel
	var panel = Panel.new()
	panel.add_theme_stylebox_override("panel", _make_panel_style())
	var vbox = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	vbox.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	vbox.custom_minimum_size = Vector2(420, 280)
	vbox.add_theme_constant_override("separation", 14)

	# Title
	var title = Label.new()
	title.text = "✨  Adult Verification  ✨"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	vbox.add_child(title)

	# Subtitle
	var sub = Label.new()
	sub.text = "To show ads, please verify you are an adult."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 14)
	vbox.add_child(sub)

	vbox.add_child(_spacer(8))

	# Problem
	problem_label.text = "Solve:  %d  %s  %d  =  ?" % [_a, _operator, _b]
	problem_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	problem_label.add_theme_font_size_override("font_size", 28)
	problem_label.add_theme_color_override("font_color", Color(1, 0.9, 0.3))
	vbox.add_child(problem_label)

	vbox.add_child(_spacer(6))

	# Input
	input.placeholder_text = "Type your answer"
	input.alignment = HORIZONTAL_ALIGNMENT_CENTER
	input.expand_to_text_length = true
	input.max_length = 4
	input.custom_minimum_size = Vector2(160, 42)
	input.add_theme_font_size_override("font_size", 22)
	input.text_submitted.connect(_on_submit)
	vbox.add_child(input)

	# Buttons row
	var hbox = HBoxContainer.new()
	hbox.alignment = BOX_ALIGNMENT_CENTER
	hbox.add_theme_constant_override("separation", 16)

	submit_btn.text = "✓  Verify"
	submit_btn.custom_minimum_size = Vector2(140, 46)
	submit_btn.add_theme_font_size_override("font_size", 16)
	submit_btn.pressed.connect(_on_submit.bind(null))
	hbox.add_child(submit_btn)

	skip_btn.text = "✗  Skip (no ads)"
	skip_btn.custom_minimum_size = Vector2(160, 46)
	skip_btn.add_theme_font_size_override("font_size", 14)
	skip_btn.pressed.connect(_on_skip)
	hbox.add_child(skip_btn)

	vbox.add_child(hbox)

	# Feedback
	feedback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	feedback.add_theme_font_size_override("font_size", 14)
	vbox.add_child(feedback)

	panel.add_child(vbox)
	add_child(panel)
	_center_panel(panel)

	# Focus
	input.grab_focus.call_deferred()

func _make_panel_style() -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = Color(0.08, 0.08, 0.15, 0.95)
	s.border_color = Color(0.3, 0.3, 0.6)
	s.border_width_left = 2
	s.border_width_right = 2
	s.border_width_top = 2
	s.border_width_bottom = 2
	s.corner_radius_top_left = 12
	s.corner_radius_top_right = 12
	s.corner_radius_bottom_left = 12
	s.corner_radius_bottom_right = 12
	s.content_margin_left = 28
	s.content_margin_right = 28
	s.content_margin_top = 24
	s.content_margin_bottom = 24
	return s

func _spacer(h: int) -> Control:
	var c = Control.new()
	c.custom_minimum_size = Vector2(0, h)
	return c

func _center_panel(panel: Panel) -> void:
	panel.position = Vector2(
		(get_viewport_rect().size.x - panel.custom_minimum_size.x) / 2.0,
		(get_viewport_rect().size.y - panel.custom_minimum_size.y) / 2.0
	)
	resized.connect(func(): _center_panel(panel))
	panel.resized.connect(func(): _center_panel(panel))

func _on_submit(_text: String = "") -> void:
	var now = Time.get_unix_time_from_system()
	if now < _lockout_until:
		feedback.text = "Too many attempts. Try again in %d min." % [int((_lockout_until - now) / 60.0 + 1)]
		feedback.add_theme_color_override("font_color", Color.RED)
		return

	var text = input.text.strip_edges()
	if text.is_empty():
		feedback.text = "Please type an answer."
		return

	var answer = text.to_int()
	if answer == _correct:
		feedback.text = "✅  Correct!  ✅"
		feedback.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3))
		feedback.show()
		# Set parent approval
		GameSession.parent_approved = true
		GameSession.parent_approved_time = now
		await get_tree().create_timer(0.6).timeout
		parent_approved.emit()
		queue_free()
	else:
		_attempts += 1
		var remaining = MAX_ATTEMPTS - _attempts
		if remaining <= 0:
			_lockout_until = now + COOLDOWN_SECONDS
			feedback.text = "❌  Locked out. Try again in 5 min.  ❌"
			feedback.add_theme_color_override("font_color", Color.RED)
			submit_btn.disabled = true
			skip_btn.grab_focus()
		else:
			feedback.text = "❌  Wrong. %d attempt(s) remaining." % remaining
			feedback.add_theme_color_override("font_color", Color.ORANGE)
		input.clear()
		input.grab_focus()

func _on_skip() -> void:
	skipped.emit()
	queue_free()
