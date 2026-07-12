extends Node
## IAPManager — In-App Purchases controller.
## Manages consumables, non-consumables, and subscriptions.
##
## Integrates with:
##   - GodotGooglePlayBilling (Android) — real purchases on Google Play builds
##   - InAppStore (iOS) — real purchases on App Store builds
##   - Simulation mode — fallback on desktop/web/dev when no plugin is available
##
## Google Play test product IDs (work without a store listing):
##   android.test.purchased   — always succeeds
##   android.test.canceled    — user cancels
##   android.test.item_unavailable — product not found
##
## FLUSSO PAGAMENTO:
##   Utente compra → Apple/Google 30% cut → paga te il 70%
##   App Store: $99/anno sviluppatore, pagamento mensile
##   Play Store: $25 una tantum, pagamento mensile
##   Entrambi: bonifico bancario, payout ~45-60gg dopo la vendita

enum ProductType { CONSUMABLE, NON_CONSUMABLE, SUBSCRIPTION }

class Product:
	var id: String
	var type: ProductType
	var price: float
	var currency: String
	var title: String
	var description: String

	func _init(p_id: String, p_type: ProductType, p_price: float, p_currency: String = "USD") -> void:
		id = p_id
		type = p_type
		price = p_price
		currency = p_currency
		title = p_id
		description = ""

enum Platform { ANDROID, IOS, DESKTOP, WEB }

var is_initialized: bool = false
var products: Dictionary = {}
var purchase_history: Array = []
var total_iap_revenue: float = 0.0

# Plugin references (one will be non-null if available)
var _google_billing = null   # GodotGooglePlayBilling (Android)
var _storekit = null         # InAppStore (iOS)
var _platform: Platform = Platform.DESKTOP
var _plugin_available: bool = false
var _pending_purchases: Dictionary = {}  # product_id → callback info

signal purchase_successful(product_id: String, transaction_id: String)
signal purchase_failed(product_id: String, error: String)
signal purchase_restored(product_id: String)
signal subscription_status_changed(product_id: String, active: bool)

func _ready() -> void:
	_detect_platform()
	_try_bind_plugins()
	_register_products()


func _detect_platform() -> void:
	if OS.get_name() == "Android":
		_platform = Platform.ANDROID
	elif OS.get_name() == "iOS":
		_platform = Platform.IOS
	elif OS.get_name() == "Web":
		_platform = Platform.WEB
	else:
		_platform = Platform.DESKTOP


func _try_bind_plugins() -> void:
	match _platform:
		Platform.ANDROID:
			if Engine.has_singleton("GodotGooglePlayBilling"):
				_google_billing = Engine.get_singleton("GodotGooglePlayBilling")
				_plugin_available = true
				_bind_google_billing_signals()
				print("IAPManager: GodotGooglePlayBilling bound")
			else:
				print("IAPManager: GodotGooglePlayBilling not available — using simulation")

		Platform.IOS:
			if Engine.has_singleton("InAppStore"):
				_storekit = Engine.get_singleton("InAppStore")
				_plugin_available = true
				_bind_storekit_signals()
				print("IAPManager: InAppStore bound")
			else:
				print("IAPManager: InAppStore not available — using simulation")

		_:  # Desktop / Web
			print("IAPManager: No IAP plugin available on this platform — using simulation")


func _bind_google_billing_signals() -> void:
	if not _google_billing:
		return

	if _google_billing.has_signal("connected"):
		_google_billing.connect("connected", _on_gb_connected)
	if _google_billing.has_signal("disconnected"):
		_google_billing.connect("disconnected", _on_gb_disconnected)
	if _google_billing.has_signal("purchases_updated"):
		_google_billing.connect("purchases_updated", _on_gb_purchases_updated)
	if _google_billing.has_signal("purchase_error"):
		_google_billing.connect("purchase_error", _on_gb_purchase_error)
	if _google_billing.has_signal("purchase_acknowledged"):
		_google_billing.connect("purchase_acknowledged", _on_gb_purchase_acknowledged)


func _bind_storekit_signals() -> void:
	if not _storekit:
		return

	if _storekit.has_signal("purchase_successful"):
		_storekit.connect("purchase_successful", _on_sk_purchase_successful)
	if _storekit.has_signal("purchase_failed"):
		_storekit.connect("purchase_failed", _on_sk_purchase_failed)
	if _storekit.has_signal("restore_successful"):
		_storekit.connect("restore_successful", _on_sk_restore_successful)
	if _storekit.has_signal("restore_failed"):
		_storekit.connect("restore_failed", _on_sk_restore_failed)


func _register_products() -> void:
	# Consumabili — ricompro più volte (gemme, monete, booster)
	_add_product("coins_small", ProductType.CONSUMABLE, 0.99, "Small Coin Pack")
	_add_product("coins_medium", ProductType.CONSUMABLE, 2.99, "Medium Coin Pack")
	_add_product("coins_large", ProductType.CONSUMABLE, 9.99, "Large Coin Pack")

	# Non-consumabile — acquisto singolo permanente
	_add_product("remove_ads", ProductType.NON_CONSUMABLE, 3.99, "Remove Ads")
	_add_product("starter_pack", ProductType.CONSUMABLE, 4.99, "Starter Pack")

	# Battle Pass / Subscription
	_add_product("battle_pass", ProductType.CONSUMABLE, 7.99, "Battle Pass")
	_add_product("vip_monthly", ProductType.SUBSCRIPTION, 6.99, "VIP Monthly")


func _add_product(id: String, type: ProductType, price: float, title: String) -> void:
	products[id] = Product.new(id, type, price)
	products[id].title = title


# ── Initialization ────────────────────────────────────────────────────────────

func initialize() -> void:
	## Initialize IAP system. Connects to Google Play Billing or falls back.
	if _google_billing and _google_billing.has_method("start"):
		_google_billing.start()
		print("IAPManager: Starting Google Play Billing connection...")
	elif _storekit:
		print("IAPManager: InAppStore available — ready for purchases")
	else:
		print("IAPManager: No IAP plugin — running in simulation mode")

	is_initialized = true
	purchase_history = SaveManager.get_value("purchase_history", [])
	total_iap_revenue = SaveManager.get_value("total_iap_revenue", 0.0)
	print("IAPManager: Initialized with ", products.size(), " products on ", OS.get_name())


# ── Purchase flow ─────────────────────────────────────────────────────────────

func purchase(product_id: String, quantity: int = 1) -> void:
	if not is_initialized:
		_fail(product_id, "not_initialized")
		return

	if not products.has(product_id):
		_fail(product_id, "invalid_product")
		return

	var product = products[product_id]

	# Track the pending purchase
	_pending_purchases[product_id] = {
		"product": product,
		"quantity": quantity,
		"timestamp": Time.get_unix_time_from_system()
	}

	print("IAPManager: Purchase initiated for ", product_id, " (qty=", quantity, ")")
	AnalyticsManager.track_event("iap_initiated", {"product": product_id, "qty": quantity})

	match _platform:
		Platform.ANDROID:
			_purchase_android(product_id, product.type)
		Platform.IOS:
			_purchase_ios(product_id)
		_:
			_purchase_simulated(product_id, quantity)


func _purchase_android(product_id: String, type: ProductType) -> void:
	if not _google_billing or not _google_billing.has_method("purchase"):
		# Fallback: simulate
		_purchase_simulated(product_id, 1)
		return

	var sku_type: String
	match type:
		ProductType.CONSUMABLE:
			sku_type = "inapp"
		ProductType.NON_CONSUMABLE:
			sku_type = "inapp"
		ProductType.SUBSCRIPTION:
			sku_type = "subs"

	# Use test product on debug builds
	var sku = "android.test.purchased" if OS.is_debug_build() else product_id
	_google_billing.purchase(sku)


func _purchase_ios(product_id: String) -> void:
	if not _storekit or not _storekit.has_method("purchase_product"):
		_purchase_simulated(product_id, 1)
		return

	_storekit.purchase_product(product_id)


func _purchase_simulated(product_id: String, quantity: int) -> void:
	## Simulate a purchase on platforms without real IAP (desktop/web/dev).
	await get_tree().create_timer(1.0).timeout
	_on_purchase_success(product_id, "sim_" + str(Time.get_unix_time_from_system()))


# ── Plugin signal handlers: Google Play Billing ───────────────────────────────

func _on_gb_connected() -> void:
	print("IAPManager: Google Play Billing connected")
	if _google_billing and _google_billing.has_method("query_purchases"):
		_google_billing.query_purchases("inapp")
		_google_billing.query_purchases("subs")


func _on_gb_disconnected() -> void:
	print("IAPManager: Google Play Billing disconnected")


func _on_gb_purchases_updated(purchases: Array) -> void:
	for purchase in purchases:
		var product_id = purchase.get("product_id", "")
		var order_id = purchase.get("order_id", "")
		var purchase_token = purchase.get("purchase_token", "")
		var is_acknowledged = purchase.get("is_acknowledged", false)

		# Acknowledge if not already done (required for consumables within 3 days)
		if not is_acknowledged and _google_billing and _google_billing.has_method("acknowledge_purchase"):
			_google_billing.acknowledge_purchase(purchase_token)

		_on_purchase_success(product_id, order_id)


func _on_gb_purchase_error(response_id: int, error_message: String) -> void:
	push_warning("IAPManager: Google Play Billing error [", response_id, "]: ", error_message)
	_fail("unknown", "billing_error: " + error_message)


func _on_gb_purchase_acknowledged(purchase_token: String) -> void:
	print("IAPManager: Purchase acknowledged: ", purchase_token)


# ── Plugin signal handlers: InAppStore (iOS) ──────────────────────────────────

func _on_sk_purchase_successful(product_id: String, transaction_id: String) -> void:
	_on_purchase_success(product_id, transaction_id)
	if _storekit and _storekit.has_method("finish_transaction"):
		_storekit.finish_transaction(transaction_id)


func _on_sk_purchase_failed(product_id: String, error_code: int, error_message: String) -> void:
	push_warning("IAPManager: InAppStore error [", error_code, "]: ", error_message)
	_fail(product_id, "storekit_error: " + error_message)


func _on_sk_restore_successful(product_ids: Array) -> void:
	for pid in product_ids:
		purchase_restored.emit(pid)


func _on_sk_restore_failed(error_code: int, error_message: String) -> void:
	push_warning("IAPManager: InAppStore restore failed [", error_code, "]: ", error_message)


# ── Success / failure handlers ────────────────────────────────────────────────

func _on_purchase_success(product_id: String, transaction_id: String) -> void:
	if not products.has(product_id):
		push_warning("IAPManager: Purchase success for unknown product: ", product_id)
		return

	var product = products[product_id]
	var revenue = product.price * 0.7  # After store cut (30%)

	_verify_receipt(product_id, transaction_id)

	total_iap_revenue += revenue
	purchase_history.append({
		"product": product_id,
		"price": product.price,
		"revenue": revenue,
		"timestamp": Time.get_unix_time_from_system(),
		"transaction": transaction_id
	})

	SaveManager.set_value("purchase_history", purchase_history)
	SaveManager.set_value("total_iap_revenue", total_iap_revenue)
	SaveManager.save_to_disk()

	EventBus.purchase_completed.emit(product_id, revenue)
	purchase_successful.emit(product_id, transaction_id)

	AnalyticsManager.track_event("iap_success", {
		"product": product_id,
		"revenue": revenue,
		"total_revenue": total_iap_revenue
	})

	_grant_purchase(product_id)
	_pending_purchases.erase(product_id)


func _fail(product_id: String, error: String) -> void:
	EventBus.purchase_failed.emit(product_id, error)
	purchase_failed.emit(product_id, error)
	_pending_purchases.erase(product_id)

	AnalyticsManager.track_event("iap_failure", {
		"product": product_id,
		"error": error
	})


func _verify_receipt(product_id: String, transaction_id: String) -> void:
	## Receipt verification stub.
	## In production: send receipt to your backend server for validation.
	## Google Play: verify purchase token via Google Play Developer API
	## App Store: verify via /verifyReceipt endpoint
	if transaction_id.begins_with("sim_"):
		print("IAPManager: Simulated purchase — no receipt verification needed")
	else:
		print("IAPManager: Receipt verification for ", product_id, " (txn=", transaction_id, ")")


# ── Grant purchases ───────────────────────────────────────────────────────────

func _grant_purchase(product_id: String) -> void:
	match product_id:
		"remove_ads":
			SaveManager.set_value("ads_removed", true)
			EventBus.currency_changed.emit("premium", 0, "remove_ads")
		"coins_small":
			GameManager.add_currency(500, "coins", "iap:" + product_id)
		"coins_medium":
			GameManager.add_currency(1500, "coins", "iap:" + product_id)
		"coins_large":
			GameManager.add_currency(6000, "coins", "iap:" + product_id)
		"starter_pack":
			GameManager.add_currency(2000, "coins", "iap:" + product_id)
			SaveManager.set_value("has_starter_pack", true)
		"battle_pass":
			SaveManager.set_value("has_battle_pass", true)
			EventBus.milestone_reached.emit("battle_pass_activated", 0)
		"vip_monthly":
			var expiry = Time.get_unix_time_from_system() + 2592000  # 30 days
			SaveManager.set_value("vip_expiry", expiry)
			subscription_status_changed.emit(product_id, true)
		_:
			push_warning("IAPManager: Unknown product — no grant defined: ", product_id)


# ── Query helpers ─────────────────────────────────────────────────────────────

func is_ads_removed() -> bool:
	return SaveManager.get_value("ads_removed", false)


func has_battle_pass() -> bool:
	return SaveManager.get_value("has_battle_pass", false)


func is_vip_active() -> bool:
	var expiry = SaveManager.get_value("vip_expiry", 0)
	return Time.get_unix_time_from_system() < expiry


func has_starter_pack() -> bool:
	return SaveManager.get_value("has_starter_pack", false)


func get_product_list(type_filter: ProductType = -1) -> Array[Product]:
	## Return all products, optionally filtered by type.
	var result: Array[Product] = []
	for p in products.values():
		if type_filter == -1 or p.type == type_filter:
			result.append(p)
	return result


func restore_purchases() -> void:
	## Restore past purchases (non-consumables, subscriptions).
	match _platform:
		Platform.ANDROID:
			if _google_billing and _google_billing.has_method("query_purchases"):
				_google_billing.query_purchases("inapp")
				_google_billing.query_purchases("subs")
		Platform.IOS:
			if _storekit and _storekit.has_method("restore_purchases"):
				_storekit.restore_purchases()
		_:
			# Restore from save data (desktop/web)
			for entry in purchase_history:
				var pid = entry.get("product", "")
				if pid and pid != "remove_ads":
					purchase_restored.emit(pid)
				elif pid:
					SaveManager.set_value("ads_removed", true)
					purchase_restored.emit(pid)
