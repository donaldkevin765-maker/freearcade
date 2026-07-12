extends Node
## AdsManager — Ad monetization controller.
## Manages rewarded, interstitial, and banner ads via the Godot AdMob Android plugin.
## Falls back to simulated ads when the plugin is unavailable (desktop/web/dev).
##
## Google test ad unit IDs (work without an AdMob account):
##   Banner:       ca-app-pub-3940256099942544/6300978111
##   Interstitial: ca-app-pub-3940256099942544/1033173712
##   Rewarded:     ca-app-pub-3940256099942544/5224354917
##
## Replace these with real IDs in `export_presets.cfg` or via init params before release.
##
## FLUSSO PAGAMENTO:
##   Utente vede ad → AdMob → paga TE (bonifico/PayPal)
##   Network: ~$5-15 eCPM per rewarded, $2-8 interstitial
##   Pagamento: mensile, soglia minima ~$100

enum AdType { REWARDED, INTERSTITIAL, BANNER }
enum AdNetwork { ADMOB, UNITY_ADS, APPLOVIN }

const MIN_SECONDS_BETWEEN_INTERSTITIAL: float = 45.0
const MIN_SECONDS_BETWEEN_REWARDED: float = 5.0

# Google test ad unit IDs — work in dev without account setup
const TEST_BANNER_ID: String = "ca-app-pub-3940256099942544/6300978111"
const TEST_INTERSTITIAL_ID: String = "ca-app-pub-3940256099942544/1033173712"
const TEST_REWARDED_ID: String = "ca-app-pub-3940256099942544/5224354917"

var is_initialized: bool = false
var last_interstitial_time: float = 0.0
var last_rewarded_time: float = 0.0
var ad_impressions: Dictionary = {}
var total_ad_revenue: float = 0.0

var _admob = null                      # AdMob plugin singleton
var _plugin_available: bool = false    # true if AdMob singleton found

# Signals handled by AdMob plugin or simulation
signal ad_loaded(ad_type: int, network: int)
signal ad_failed_to_load(ad_type: int, network: int, error: String)
signal ad_opened(ad_type: int)
signal ad_closed(ad_type: int)
signal ad_rewarded(amount: int, currency: String)
signal ad_clicked(ad_type: int)


func _ready() -> void:
	_try_bind_plugin()
	EventBus.game_started.connect(_on_game_start)
	EventBus.game_over.connect(_on_game_over)


func _try_bind_plugin() -> void:
	## Try to acquire the AdMob Android plugin singleton.
	## On mobile with the plugin installed, this gives real ads.
	## On desktop/web/plugin-missing, we fall back to simulation.
	if Engine.has_singleton("AdMob"):
		_admob = Engine.get_singleton("AdMob")
		_plugin_available = true
		_bind_plugin_signals()
		print("AdsManager: AdMob plugin bound")
	else:
		print("AdsManager: AdMob plugin not available — using simulation")


func _bind_plugin_signals() -> void:
	if not _admob:
		return
	# The official Godot AdMob Android plugin emits these signals.
	# Wrap in has_signal checks for forward-compatibility with different plugin versions.
	if _admob.has_signal("on_rewarded"):
		_admob.connect("on_rewarded", _on_plugin_rewarded)
	if _admob.has_signal("on_rewarded_ad_closed"):
		_admob.connect("on_rewarded_ad_closed", _on_plugin_rewarded_closed)
	if _admob.has_signal("on_interstitial_closed"):
		_admob.connect("on_interstitial_closed", _on_plugin_interstitial_closed)
	if _admob.has_signal("on_ad_failed_to_load"):
		_admob.connect("on_ad_failed_to_load", _on_plugin_ad_failed)


func initialize() -> void:
	## Initialize the AdMob SDK and pre-load ads.
	if _admob and _admob.has_method("initialize"):
		_admob.initialize()
		_preload_ads()
	is_initialized = true
	print("AdsManager: Initialized (plugin=", _plugin_available, ")")


func _preload_ads() -> void:
	## Pre-load interstitial and rewarded video so they're ready when needed.
	if not _admob:
		return
	if _admob.has_method("load_interstitial"):
		_admob.load_interstitial(TEST_INTERSTITIAL_ID)
	if _admob.has_method("load_rewarded_video"):
		_admob.load_rewarded_video(TEST_REWARDED_ID)
	if _admob.has_method("load_banner"):
		_admob.load_banner(TEST_BANNER_ID, "SMART_BANNER", false)


# ── Show methods ──────────────────────────────────────────────────────────────

func show_rewarded(placement: String = "rewarded_default") -> bool:
	## Show a rewarded video ad. Returns true if the ad was shown.
	if not is_initialized:
		push_warning("AdsManager: Not initialized")
		return false

	var now = Time.get_unix_time_from_system()
	if now - last_rewarded_time < MIN_SECONDS_BETWEEN_REWARDED:
		return false

	last_rewarded_time = now
	EventBus.ad_requested.emit(placement)
	_ad_impression(AdType.REWARDED, placement)

	if _plugin_available and _admob:
		if _admob.has_method("is_rewarded_video_loaded") and _admob.is_rewarded_video_loaded():
			_admob.show_rewarded_video()
			return true
		else:
			# Ad not loaded yet — attempt to load and notify
			_admob.load_rewarded_video(TEST_REWARDED_ID)
			push_warning("AdsManager: Rewarded video not pre-loaded, requesting now")
			return false
	else:
		# Fallback: simulate for testing on desktop
		_simulate_rewarded()
		return true


func show_interstitial(placement: String = "interstitial_default") -> bool:
	## Show an interstitial ad if cooldown and session conditions are met.
	if not is_initialized:
		return false

	# Skip if user purchased ad removal
	if IAPManager.is_ads_removed():
		return false

	var now = Time.get_unix_time_from_system()
	if now - last_interstitial_time < MIN_SECONDS_BETWEEN_INTERSTITIAL:
		return false

	# Don't show interstitial on first 2 sessions (retention optimization)
	if GameManager.session_count <= 2:
		return false

	last_interstitial_time = now
	EventBus.ad_requested.emit(placement)
	_ad_impression(AdType.INTERSTITIAL, placement)

	if _plugin_available and _admob:
		if _admob.has_method("is_interstitial_loaded") and _admob.is_interstitial_loaded():
			_admob.show_interstitial()
			return true
		else:
			_admob.load_interstitial(TEST_INTERSTITIAL_ID)
			return false
	else:
		# Fallback: no simulation needed for interstitial (just tracking)
		return true


func show_banner(visible: bool = true) -> void:
	## Show or hide the banner ad.
	if not is_initialized:
		return

	# Skip if user purchased ad removal and we're trying to show
	if visible and IAPManager.is_ads_removed():
		return

	if _plugin_available and _admob:
		if visible and _admob.has_method("show_banner"):
			_admob.show_banner()
		elif _admob.has_method("hide_banner"):
			_admob.hide_banner()
		if visible:
			_ad_impression(AdType.BANNER, "banner_default")
	else:
		if visible:
			_ad_impression(AdType.BANNER, "banner_default")


# ── Plugin signal handlers ────────────────────────────────────────────────────

func _on_plugin_rewarded(type: int, amount: int, currency: String) -> void:
	## Called when the AdMob plugin emits a reward grant.
	ad_rewarded.emit(amount, currency)
	EventBus.ad_rewarded.emit(amount, currency)
	_track_revenue("rewarded", 0.01)
	# Preload next rewarded ad
	if _admob and _admob.has_method("load_rewarded_video"):
		_admob.load_rewarded_video(TEST_REWARDED_ID)


func _on_plugin_rewarded_closed() -> void:
	ad_closed.emit(AdType.REWARDED)


func _on_plugin_interstitial_closed() -> void:
	ad_closed.emit(AdType.INTERSTITIAL)
	# Preload next interstitial
	if _admob and _admob.has_method("load_interstitial"):
		_admob.load_interstitial(TEST_INTERSTITIAL_ID)


func _on_plugin_ad_failed(ad_type: int, error_code: int, error_message: String) -> void:
	push_warning("AdsManager: Ad failed type=", ad_type, " code=", error_code, " msg=", error_message)
	ad_failed_to_load.emit(ad_type, AdNetwork.ADMOB, error_message)


# ── Simulation fallback (desktop / dev) ───────────────────────────────────────

func _simulate_rewarded() -> void:
	await get_tree().create_timer(1.5).timeout
	var amount = 50
	var currency = "coins"
	ad_rewarded.emit(amount, currency)
	EventBus.ad_rewarded.emit(amount, currency)
	_track_revenue("rewarded", 0.01)


# ── Event‑driven ad hooks ─────────────────────────────────────────────────────

func _on_game_start(game_id: String) -> void:
	## Pre-load the next interstitial when a game starts.
	if _admob and _admob.has_method("load_interstitial"):
		_admob.load_interstitial(TEST_INTERSTITIAL_ID)


func _on_game_over(score: int, reason: String) -> void:
	## Show interstitial after game over if cooldown allows.
	if reason == "quit":
		return
	if GameManager.session_count <= 2:
		return
	await get_tree().create_timer(0.8).timeout
	show_interstitial("game_over")


# ── Analytics & revenue tracking ──────────────────────────────────────────────

func _ad_impression(ad_type: AdType, placement: String) -> void:
	var key = str(ad_type) + "_" + placement
	ad_impressions[key] = ad_impressions.get(key, 0) + 1
	AnalyticsManager.track_event("ad_impression", {
		"type": ad_type,
		"placement": placement,
		"total": ad_impressions[key]
	})


func _track_revenue(source: String, amount: float) -> void:
	total_ad_revenue += amount
	AnalyticsManager.track_event("ad_revenue", {
		"source": source,
		"amount": amount,
		"total": total_ad_revenue
	})


func get_daily_revenue_estimate() -> float:
	## Rough estimation based on impressions and typical eCPM.
	var est_eCPM = {
		AdType.REWARDED: 10.0,      # $10 per 1000 views
		AdType.INTERSTITIAL: 5.0,   # $5 per 1000 views
		AdType.BANNER: 0.5          # $0.50 per 1000 views
	}
	var total: float = 0.0
	for key in ad_impressions:
		var parts = key.split("_")
		if parts.is_empty():
			continue
		var ad_type = AdType.REWARDED  # default
		if key.begins_with("1"):
			ad_type = AdType.INTERSTITIAL
		elif key.begins_with("2"):
			ad_type = AdType.BANNER
		total += (ad_impressions[key] / 1000.0) * est_eCPM.get(ad_type, 5.0)
	return total
