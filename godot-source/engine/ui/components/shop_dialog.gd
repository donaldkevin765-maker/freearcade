extends CanvasLayer
## ShopDialog — In-App purchase store overlay.
## Shows available products (coin packs, remove ads, VIP) and handles purchases
## through IAPManager. Instantiated by the hub when the shop button is pressed.

signal closed()

var _product_buttons: Dictionary = {}  # product_id → Button

@onready var _overlay: ColorRect = ColorRect.new()
@onready var _panel: Panel = Panel.new()
@onready var _title: Label = Label.new()
@onready var _coin_label: Label = Label.new()
@onready var _product_container: VBoxContainer = VBoxContainer.new()
@onready var _close_btn: Button = Button.new()
@onready var _feedback: Label = Label.new()

func _ready() -> void:
	_build_ui()
	_bind_signals()
	_refresh_coins()

	# Check for ads removed status to update button state
	if IAPManager.is_ads_removed():
		_set_product_purchased("remove_ads")


func _build_ui() -> void:
	# Overlay
	_overlay.color = Color(0.0, 0.0, 0.0, 0.75)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_overlay)

	# Panel style
	var panel_style = StyleBoxFlat.new()
	panel_style.bg_color = Color(0.08, 0.08, 0.18, 0.97)
	panel_style.border_color = Color(0.4, 0.4, 0.8, 0.6)
	panel_style.border_width_left = 2
	panel_style.border_width_right = 2
	panel_style.border_width_top = 2
	panel_style.border_width_bottom = 2
	panel_style.corner_radius_top_left = 16
	panel_style.corner_radius_top_right = 16
	panel_style.corner_radius_bottom_left = 16
	panel_style.corner_radius_bottom_right = 16
	panel_style.content_margin_left = 20
	panel_style.content_margin_right = 20
	panel_style.content_margin_top = 16
	panel_style.content_margin_bottom = 16
	_panel.add_theme_stylebox_override("panel", panel_style)
	_panel.custom_minimum_size = Vector2(420, 520)
	add_child(_panel)

	# Inner VBox
	var vbox = VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 10)
	_panel.add_child(vbox)

	# Header row: title + coin balance
	var header = HBoxContainer.new()
	header.add_theme_constant_override("separation", 20)

	_title.text = "🛒  Shop"
	_title.add_theme_font_size_override("font_size", 26)
	_title.add_theme_color_override("font_color", Color(1, 1, 1))
	header.add_child(_title)

	# Spacer
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)

	_coin_label.add_theme_font_size_override("font_size", 18)
	_coin_label.add_theme_color_override("font_color", Color(1, 0.85, 0.3))
	header.add_child(_coin_label)

	vbox.add_child(header)

	# Separator
	var sep = ColorRect.new()
	sep.custom_minimum_size = Vector2(0, 2)
	sep.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sep.color = Color(0.3, 0.3, 0.6, 0.4)
	vbox.add_child(sep)

	# Scroll area for products
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 300)
	vbox.add_child(scroll)

	_product_container.add_theme_constant_override("separation", 8)
	_product_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_product_container)

	_build_product_list()

	# Feedback label
	_feedback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_feedback.add_theme_font_size_override("font_size", 14)
	_feedback.add_theme_color_override("font_color", Color(0.5, 0.8, 1.0))
	vbox.add_child(_feedback)

	# Close button
	var close_hbox = HBoxContainer.new()
	close_hbox.alignment = BOX_ALIGNMENT_CENTER
	close_hbox.add_theme_constant_override("separation", 12)

	var restore_btn = Button.new()
	restore_btn.text = "🔄  Restore Purchases"
	restore_btn.custom_minimum_size = Vector2(180, 42)
	restore_btn.add_theme_font_size_override("font_size", 14)
	restore_btn.pressed.connect(_on_restore)
	close_hbox.add_child(restore_btn)

	_close_btn.text = "✗  Close"
	_close_btn.custom_minimum_size = Vector2(140, 42)
	_close_btn.add_theme_font_size_override("font_size", 16)
	_close_btn.pressed.connect(_on_close)
	close_hbox.add_child(_close_btn)

	vbox.add_child(close_hbox)

	# Center the panel
	_center_panel()


func _build_product_list() -> void:
	## Build product buttons from IAPManager's registered products.
	var all_products = IAPManager.get_product_list()

	# Sort: consumables first, then non-consumable, then subscriptions
	var sorted = []
	for p in all_products:
		match p.type:
			IAPManager.ProductType.CONSUMABLE:
				sorted.push_front(p)
			IAPManager.ProductType.SUBSCRIPTION:
				sorted.append(p)
			_:
				sorted.append(p)

	for product in sorted:
		var item = _make_product_row(product)
		_product_container.add_child(item)
		_product_buttons[product.id] = item


func _make_product_row(product) -> Control:
	## Create a horizontal product row: description + price button.
	var hbox = HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 10)
	hbox.custom_minimum_size = Vector2(0, 58)
	hbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	# Background
	var bg = ColorRect.new()
	bg.color = Color(0.12, 0.12, 0.22, 0.6)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_PASS
	hbox.add_child(bg)

	# Info VBox (title + description)
	var info = VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 2)

	var title = Label.new()
	title.text = product.title
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color.WHITE)
	info.add_child(title)

	if not product.description.is_empty():
		var desc = Label.new()
		desc.text = product.description
		desc.add_theme_font_size_override("font_size", 12)
		desc.add_theme_color_override("font_color", Color(0.7, 0.7, 0.85))
		info.add_child(desc)

	hbox.add_child(info)

	# Price / Buy button
	var btn = Button.new()
	btn.custom_minimum_size = Vector2(120, 42)
	btn.add_theme_font_size_override("font_size", 15)
	btn.text = "$" + ("%.2f" % product.price)

	var product_id = product.id
	btn.pressed.connect(_on_buy_product.bind(product_id))
	hbox.add_child(btn)

	return hbox


func _bind_signals() -> void:
	IAPManager.purchase_successful.connect(_on_purchase_success)
	IAPManager.purchase_failed.connect(_on_purchase_fail)


func _refresh_coins() -> void:
	var coins = SaveManager.get_value("currency_coins", 0)
	_coin_label.text = "🪙 " + str(coins)


func _set_product_purchased(product_id: String) -> void:
	var row = _product_buttons.get(product_id)
	if not row:
		return
	# Find the button (last child)
	for c in row.get_children():
		if c is Button:
			c.disabled = true
			c.text = "✅ Owned"
			c.add_theme_color_override("font_color", Color(0.4, 0.9, 0.4))


func _center_panel() -> void:
	_panel.position = Vector2(
		(get_viewport_rect().size.x - _panel.custom_minimum_size.x) / 2.0,
		(get_viewport_rect().size.y - _panel.custom_minimum_size.y) / 2.0
	)
	resized.connect(func(): _center_panel())


# ── Purchase handlers ─────────────────────────────────────────────────────────

func _on_buy_product(product_id: String) -> void:
	_feedback.text = "Processing..."
	IAPManager.purchase(product_id)


func _on_purchase_success(product_id: String, transaction_id: String) -> void:
	_feedback.text = "✅ Purchase successful!"
	_feedback.add_theme_color_override("font_color", Color(0.3, 1.0, 0.3))
	_refresh_coins()

	if product_id == "remove_ads":
		_set_product_purchased(product_id)
	else:
		# Re-enable consumable buttons after purchase
		pass

	await get_tree().create_timer(2.0).timeout
	_feedback.text = ""


func _on_purchase_fail(product_id: String, error: String) -> void:
	_feedback.text = "❌ " + error
	_feedback.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
	await get_tree().create_timer(3.0).timeout
	_feedback.text = ""


func _on_restore() -> void:
	_feedback.text = "Restoring purchases..."
	IAPManager.restore_purchases()


func _on_close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	# Close on Escape / Android Back
	if event.is_action_pressed("ui_cancel"):
		_on_close()
