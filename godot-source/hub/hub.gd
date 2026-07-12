extends Control
## Chromatic Hub — premium launcher for the 25-game catalog.
## Age-category filtering, shared currency + daily streak, one-tap launch.

const FILTERS: Array = ["all", "3+", "16+", "17+", "18+"]

@onready var bg_gradient: BackgroundGradient = $BackgroundGradient
@onready var scroll: ScrollContainer = %Scroll
@onready var grid: GridContainer = %Grid
@onready var coin_label: Label = %CoinLabel
@onready var streak_label: Label = %StreakLabel
@onready var shop_btn: Button = %ShopButton
@onready var filter_tabs: HBoxContainer = %FilterTabs

var _cards: Array = []   # Array of {def, card}

func _ready() -> void:
	bg_gradient.color = Color(0.04, 0.04, 0.1)
	AdsManager.show_banner(true)
	shop_btn.pressed.connect(_on_shop)
	_refresh_header()
	_build_filters()
	_build_cards()
	EventBus.currency_changed.connect(_on_currency_changed)
	AnalyticsManager.track_event("hub_view", {})

func _refresh_header() -> void:
	var coins = SaveManager.get_value("currency_coins", 0)
	coin_label.text = "🪙 " + str(coins)
	var streak = SaveManager.get_value("daily_streak", 0)
	streak_label.text = "🔥 " + str(streak)

func _on_shop() -> void:
	var shop = load("res://engine/ui/components/shop_dialog.gd").new()
	add_child(shop)
	shop.closed.connect(_on_shop_closed)
	AnalyticsManager.track_event("shop_open", {})

func _on_shop_closed() -> void:
	_refresh_header()

func _on_currency_changed(_type: String, _amount: int, _source: String) -> void:
	_refresh_header()

func _build_filters() -> void:
	for f in FILTERS:
		var btn = Button.new()
		btn.custom_minimum_size = Vector2(150, 45)
		btn.text = "ALL" if f == "all" else f
		btn.add_theme_font_size_override("font_size", 18)
		btn.pressed.connect(_on_filter.bind(f))
		filter_tabs.add_child(btn)

func _build_cards() -> void:
	for def in GameCatalog.all():
		var card = _make_card(def)
		grid.add_child(card)
		_cards.append({"def": def, "card": card})

func _make_card(def: Dictionary) -> Button:
	var card = Button.new()
	card.custom_minimum_size = Vector2(320, 230)
	card.flat = true
	var accent: Color = def.get("accent", Color.CYAN)
	var sb = StyleBoxFlat.new()
	sb.bg_color = accent.darkened(0.55)
	sb.corner_radius_top_left = 16
	sb.corner_radius_top_right = 16
	sb.corner_radius_bottom_left = 16
	sb.corner_radius_bottom_right = 16
	sb.border_width_left = 2
	sb.border_width_right = 2
	sb.border_width_top = 2
	sb.border_width_bottom = 2
	sb.border_color = accent
	card.add_theme_stylebox_override("normal", sb)
	card.add_theme_stylebox_override("hover", sb)
	card.add_theme_stylebox_override("pressed", sb)

	var vbox = VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.set_offsets_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 8)
	vbox.modulate = Color(1, 1, 1, 1)
	card.add_child(vbox)

	var title = Label.new()
	title.text = def["title"]
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color.WHITE)
	title.add_theme_font_size_override("font_size", 26)
	vbox.add_child(title)

	var rating = Label.new()
	rating.text = "RATING  " + def["rating"]
	rating.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rating.add_theme_color_override("font_color", _rating_color(def["rating"]))
	rating.add_theme_font_size_override("font_size", 18)
	vbox.add_child(rating)

	var desc = Label.new()
	desc.text = def["desc"]
	desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95, 0.9))
	desc.add_theme_font_size_override("font_size", 14)
	vbox.add_child(desc)

	var hs = SaveManager.get_value(def["id"] + "_high_score", 0)
	var best = Label.new()
	best.text = "Best: " + str(hs)
	best.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	best.add_theme_color_override("font_color", Color(1, 0.85, 0.3, 1))
	best.add_theme_font_size_override("font_size", 16)
	vbox.add_child(best)

	card.pressed.connect(_on_card_pressed.bind(def))
	return card

func _rating_color(rating: String) -> Color:
	match rating:
		"3+": return Color(0.4, 1, 0.5, 1)
		"16+": return Color(1, 0.8, 0.3, 1)
		"17+": return Color(1, 0.5, 0.3, 1)
		"18+": return Color(1, 0.3, 0.3, 1)
		_: return Color.WHITE

func _on_card_pressed(def: Dictionary) -> void:
	GameSession.current_def = def
	# Reset parent approval on each launch attempt
	GameSession.parent_approved = false
	GameSession.parent_approved_time = 0.0

	var rating = def.get("rating", "3+")
	if rating == "17+" or rating == "18+":
		# Show parent gate before launching mature games
		var gate = load("res://engine/ui/components/parent_gate.gd").new()
		add_child(gate)
		gate.parent_approved.connect(_launch_game.bind(def, true))
		gate.skipped.connect(_launch_game.bind(def, false))
	else:
		_launch_game(def, true)

func _launch_game(def: Dictionary, can_show_ads: bool) -> void:
	GameSession.parent_approved = can_show_ads
	AdsManager.show_banner(false)
	get_tree().change_scene_to_file("res://engine/game_core.tscn")
	AnalyticsManager.track_event("game_launch", {"game_id": def["id"], "ads_allowed": can_show_ads})

func _on_filter(rating: String) -> void:
	for entry in _cards:
		entry["card"].visible = (rating == "all" or entry["def"]["rating"] == rating)
