extends Control
## GameCore — Universal, themed game engine for the whole 25-title catalog.
## One scene, three archetypes (STACK / TAP / MATCH), driven by GameSession.current_def.
## Reuses the verified Chromatic Tower stack logic + PremiumKit polish + shared
## scoring / fever / power-up / monetization scaffolding so every game feels like
## one studio. All assets are procedural (copyright-safe).

enum GamePhase { MENU, PLAYING, GAME_OVER }
enum Archetype { STACK, TAP, MATCH }
enum BlockKind { NORMAL, GOLDEN, FRAGILE, BOMB }

# --- STACK tuning ---
const BLOCK_HEIGHT: float = 28.0
const MIN_BLOCK_WIDTH: float = 40.0
const MAX_BLOCK_WIDTH: float = 200.0
const BASE_SPEED: float = 350.0
const SPEED_PER_LEVEL: float = 12.0
const NARROW_PER_LEVEL: float = 3.0
const PERFECT_THRESHOLD: float = 7.0
const PERFECT_BONUS_MULTIPLIER: float = 2.0
const FEVER_DURATION: float = 8.0
const SLOWMO_DURATION: float = 3.0
const GHOST_DURATION: float = 5.0
const CHARGE_PER_PERFECT: float = 18.0
const FEVER_PER_PERFECT: float = 12.0

# --- TAP tuning ---
const TAP_MARGIN: float = 120.0
const TAP_BASE_SPEED: float = 520.0
const TAP_ZONE_WIDTH: float = 220.0
const TAP_MAX_MISSES: int = 8

# --- MATCH tuning ---
const MATCH_COLS: int = 7
const MATCH_ROWS: int = 9
const MATCH_BASE_POINTS: int = 6

var def: Dictionary = {}
var archetype: int = Archetype.STACK
var palette: Array = []
var accent: Color = Color.CYAN
var game_id: String = "game"
var power_names: Array = ["SLOW", "WIDEN", "GHOST"]

var phase: GamePhase = GamePhase.MENU
var score: int = 0
var combo: int = 0
var max_combo: int = 0
var perfect_count: int = 0
var level: int = 0
var move_speed: float = BASE_SPEED
var move_direction: int = 1
var speed_multiplier: float = 1.0
var blocks_placed: int = 0
var misses: int = 0

var BLOCK_WIDTH: float = 140.0

var current_block: RigidBody2D = null
var tower_blocks: Array = []
var last_block_x: float = 0.0
var last_block_y: float = 0.0
var can_continue: bool = true
var has_revived: bool = false
var _pending_bonus: bool = false

var power_charge: Dictionary = { "slowmo": 0.0, "widen": 0.0, "ghost": 0.0 }
var slowmo_active: bool = false
var ghost_active: bool = false

var fever_meter: float = 0.0
var fever_active: bool = false

# --- TAP state ---
var tap_marker_x: float = 540.0
var tap_dir: int = 1
var tap_marker_speed: float = TAP_BASE_SPEED
var tap_zone_width: float = TAP_ZONE_WIDTH
var tap_zone_center: float = 540.0
var tap_marker: Node2D = null
var tap_zone_rect: ColorRect = null
var tap_track: ColorRect = null
var tap_ghost_line: ColorRect = null

# --- MATCH state ---
var match_tiles: Array = []   # [row][col] -> Button or null
var match_last: Vector2i = Vector2i(-1, -1)
var match_tile_size: float = 90.0
var match_origin: Vector2 = Vector2.ZERO

@onready var bg_gradient: BackgroundGradient = $BackgroundGradient
@onready var particle_mgr: ParticleManager = $ParticleManager
@onready var screen_shake: ScreenShake = $ScreenShake
@onready var audio_mgr: AudioManager = $AudioManager
@onready var tower_container: Node2D = $TowerContainer
@onready var aim_guide: Line2D = $TowerContainer/AimGuide
@onready var ghost_preview: Line2D = $TowerContainer/GhostPreview
@onready var world: Node2D = $World

@onready var score_label: Label = %ScoreLabel
@onready var combo_label: Label = %ComboLabel
@onready var multiplier_label: Label = %MultiplierLabel
@onready var perfect_flash: Label = %PerfectFlash
@onready var level_label: Label = %LevelLabel
@onready var milestone_popup: Label = %MilestonePopup

@onready var game_over_ui: Control = %GameOverUI
@onready var final_score: Label = %FinalScore
@onready var high_score_label: Label = %HighScoreLabel
@onready var stats_label: Label = %StatsLabel
@onready var continue_btn: Button = %ContinueButton
@onready var bonus_btn: Button = %BonusButton
@onready var restart_btn: Button = %RestartButton
@onready var menu_btn: Button = %MenuButton

@onready var start_overlay: Control = %StartOverlay
@onready var tap_to_start: Label = %TapToStart
@onready var instructions: Label = %Instructions

@onready var daily_bonus_popup: Control = %DailyBonusPopup
@onready var daily_bonus_label: Label = %DailyBonusLabel

@onready var fever_bar_fill: ColorRect = $HUD/FeverBarFill
@onready var fever_label: Label = $HUD/FeverLabel
@onready var slowmo_btn: Button = $HUD/PowerUpBar/SlowMoButton
@onready var widen_btn: Button = $HUD/PowerUpBar/WidenButton
@onready var ghost_btn: Button = $HUD/PowerUpBar/GhostButton

var _combo_tween: Tween = null
var _score_tween: Tween = null

func _ready() -> void:
	def = GameSession.current_def if not GameSession.current_def.is_empty() else _default_def()
	game_id = def.get("id", "game")
	archetype = _archetype_from_str(def.get("archetype", "stack"))
	palette = def.get("palette", [Color.CYAN, Color.MAGENTA, Color.YELLOW, Color(0.3,1,0.6), Color(0.4,0.6,1)])
	accent = def.get("accent", Color.CYAN)
	power_names = def.get("power_names", ["SLOW", "WIDEN", "GHOST"])
	bg_gradient.set_custom_colors(def.get("bg_top", Color(0.05,0.05,0.15)), def.get("bg_bottom", Color(0.1,0.05,0.2)))
	bg_gradient.color = def.get("bg_bottom", Color(0.05,0.05,0.15))

	phase = GamePhase.MENU
	AdsManager.ad_rewarded.connect(_on_ad_rewarded)
	continue_btn.pressed.connect(_on_continue)
	bonus_btn.pressed.connect(_on_bonus_ad)
	restart_btn.pressed.connect(_on_restart)
	menu_btn.pressed.connect(_on_menu)
	slowmo_btn.pressed.connect(_on_power_slowmo)
	widen_btn.pressed.connect(_on_power_widen)
	ghost_btn.pressed.connect(_on_power_ghost)

	_setup_archetype()
	_check_daily_bonus()
	_animate_start_screen()
	_spawn_initial_blocks()
	_refresh_power_buttons()
	AnalyticsManager.track_event("game_core_load", {"game_id": game_id, "archetype": archetype})

func _default_def() -> Dictionary:
	return {"id": "chromatic_tower", "title": "Chromatic Tower", "archetype": "stack", "rating": "3+"}

func _archetype_from_str(s: String) -> int:
	match s:
		"tap": return Archetype.TAP
		"match": return Archetype.MATCH
		_: return Archetype.STACK

func _setup_archetype() -> void:
	if archetype == Archetype.STACK:
		tower_container.visible = true
		aim_guide.visible = false
		world.visible = false
		instructions.text = "Tap to drop the block.\nLine it up perfectly for bonus!"
	elif archetype == Archetype.TAP:
		tower_container.visible = false
		world.visible = true
		_setup_tap()
		instructions.text = "Tap when the marker hits the zone.\nPerfect timing = big points!"
	else:
		tower_container.visible = false
		world.visible = true
		_setup_match()
		instructions.text = "Tap a group of 2+ same-color tiles to clear them."

# ===================== SHARED =====================

func _process(delta: float) -> void:
	if phase != GamePhase.PLAYING:
		return
	if archetype == Archetype.STACK:
		_process_stack(delta)
	elif archetype == Archetype.TAP:
		_process_tap(delta)
	# MATCH has no per-frame update (event driven)

func _input(event: InputEvent) -> void:
	if not (event is InputEventScreenTouch or
		(event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT)):
		return
	if not event.pressed:
		return
	if phase == GamePhase.MENU:
		_start_game()
		return
	if phase == GamePhase.PLAYING:
		if archetype == Archetype.STACK:
			_drop_block()
		elif archetype == Archetype.TAP:
			_tap_hit()

func _start_game() -> void:
	phase = GamePhase.PLAYING
	start_overlay.visible = false
	GameManager.start_game(game_id)
	AdsManager.show_banner(false)
	audio_mgr.play_button()
	audio_mgr.start_music()
	_refresh_power_buttons()
	if archetype == Archetype.STACK:
		_spawn_block()
	elif archetype == Archetype.TAP:
		_reset_tap()
	elif archetype == Archetype.MATCH:
		_reset_match()

func _check_daily_bonus() -> void:
	var today = Time.get_date_string_from_system()
	var last_daily = SaveManager.get_value("daily_bonus_date", "")
	if today != last_daily:
		var streak = SaveManager.get_value("daily_streak", 0) + 1
		SaveManager.set_value("daily_streak", streak)
		SaveManager.set_value("daily_bonus_date", today)
		SaveManager.save_to_disk()
		var bonus = 50 + (streak * 25)
		GameManager.add_currency(bonus, "coins", "daily_bonus")
		daily_bonus_label.text = "+" + str(bonus) + " daily bonus! (Day " + str(streak) + ")"
		daily_bonus_popup.visible = true
		var tween = create_tween()
		tween.tween_property(daily_bonus_popup, "modulate:a", 0.0, 2.5)
		tween.tween_callback(func(): daily_bonus_popup.visible = false; daily_bonus_popup.modulate.a = 1.0)

func _animate_start_screen() -> void:
	var tween = create_tween()
	tween.set_loops()
	tween.tween_property(tap_to_start, "modulate:a", 0.3, 1.0)
	tween.tween_property(tap_to_start, "modulate:a", 1.0, 1.0)

func _register_power_and_fever() -> void:
	for k in power_charge.keys():
		power_charge[k] = min(100.0, power_charge[k] + CHARGE_PER_PERFECT)
	_refresh_power_buttons()
	fever_meter = min(100.0, fever_meter + FEVER_PER_PERFECT)
	_update_fever_bar()
	if fever_meter >= 100.0 and not fever_active:
		_start_fever()

func _refresh_power_buttons() -> void:
	_set_power_btn(slowmo_btn, power_names[0], power_charge["slowmo"], slowmo_active)
	_set_power_btn(widen_btn, power_names[1], power_charge["widen"], false)
	_set_power_btn(ghost_btn, power_names[2], power_charge["ghost"], ghost_active)

func _set_power_btn(btn: Button, name: String, charge: float, active: bool) -> void:
	var ready = charge >= 100.0
	btn.disabled = not ready and not active
	btn.text = name + " " + str(int(charge)) + "%"
	btn.modulate = Color(1, 0.85, 0.3, 1) if ready or active else Color(1, 1, 1, 1)

func _update_fever_bar() -> void:
	var bg_left = $HUD/FeverBarBG.offset_left
	var bg_right = $HUD/FeverBarBG.offset_right
	fever_bar_fill.offset_right = bg_left + (fever_meter / 100.0) * (bg_right - bg_left)
	fever_label.text = "FEVER" if not fever_active else "FEVER! x2"
	fever_label.modulate = Color(1, 0.7, 0, 1) if not fever_active else Color.GOLD

func _start_fever() -> void:
	fever_active = true
	fever_meter = 100.0
	_update_fever_bar()
	bg_gradient.set_custom_colors(Color(0.25, 0.1, 0.0), Color(0.35, 0.2, 0.05))
	particle_mgr.burst(ParticleManager.EffectType.LEVEL_UP, Vector2(get_viewport_rect().size.x / 2, 300), Color.GOLD, 16)
	audio_mgr.play_fever()
	screen_shake.burst(0.4, 0.3)
	var t = get_tree().create_timer(FEVER_DURATION)
	t.timeout.connect(_end_fever)

func _end_fever() -> void:
	fever_active = false
	fever_meter = 0.0
	_update_fever_bar()
	bg_gradient.set_custom_colors(def.get("bg_top", Color(0.05,0.05,0.15)), def.get("bg_bottom", Color(0.1,0.05,0.2)))

func _show_perfect_flash() -> void:
	perfect_flash.text = "PERFECT!"
	var scale_tween = create_tween()
	perfect_flash.modulate = Color(1, 1, 0, 1)
	perfect_flash.scale = Vector2(1.5, 1.5)
	scale_tween.tween_property(perfect_flash, "scale", Vector2(1.0, 1.0), 0.3)
	scale_tween.set_ease(Tween.EASE_OUT)
	scale_tween.set_trans(Tween.TRANS_BACK)
	var fade_tween = create_tween()
	fade_tween.tween_interval(0.6)
	fade_tween.tween_property(perfect_flash, "modulate:a", 0.0, 0.3)

func _show_combo() -> void:
	if combo < 2:
		combo_label.text = ""
		multiplier_label.text = ""
		return
	combo_label.text = str(combo) + "x COMBO"
	multiplier_label.text = "x" + str(snapped(1 + combo * 0.5, 0.5))
	if _combo_tween: _combo_tween.kill()
	_combo_tween = create_tween()
	combo_label.scale = Vector2(1.3, 1.3)
	_combo_tween.tween_property(combo_label, "scale", Vector2(1.0, 1.0), 0.3)
	_combo_tween.set_ease(Tween.EASE_OUT)
	_combo_tween.set_trans(Tween.TRANS_BACK)
	audio_mgr.play_combo(combo)

func _show_score() -> void:
	if _score_tween: _score_tween.kill()
	score_label.text = str(score)
	_score_tween = create_tween()
	score_label.scale = Vector2(1.15, 1.15)
	_score_tween.tween_property(score_label, "scale", Vector2(1.0, 1.0), 0.2)
	_score_tween.set_ease(Tween.EASE_OUT)
	_score_tween.set_trans(Tween.TRANS_BACK)

func _milestone_celebrate(count: int) -> void:
	milestone_popup.text = "🎉 " + str(count) + " " + ("BLOCKS" if archetype == Archetype.STACK else "MOVES") + " 🎉"
	milestone_popup.visible = true
	var tween = create_tween()
	tween.tween_property(milestone_popup, "scale", Vector2(1.2, 1.2), 0.3)
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_interval(0.8)
	tween.tween_property(milestone_popup, "scale", Vector2(0.0, 0.0), 0.3)
	tween.tween_callback(func(): milestone_popup.visible = false; milestone_popup.scale = Vector2.ONE)
	particle_mgr.burst(ParticleManager.EffectType.LEVEL_UP, Vector2(get_viewport_rect().size.x / 2, 300), Color.GOLD, 12)
	audio_mgr.play_milestone()

func _add_score(amount: int) -> void:
	score += amount
	_show_score()
	if score >= 100: AchievementManager.progress("score_100")
	if score >= 500: AchievementManager.progress("score_500")

func _game_over(reason: String = "miss") -> void:
	phase = GamePhase.GAME_OVER
	GameManager.end_game(score, reason)
	aim_guide.visible = false
	ghost_preview.visible = false
	particle_mgr.burst(ParticleManager.EffectType.DEBRIS, Vector2(get_viewport_rect().size.x / 2, 800), Color.RED, 15)
	screen_shake.burst(0.8, 0.5)
	audio_mgr.play_game_over()
	audio_mgr.stop_music()
	var key = game_id + "_high_score"
	var high = SaveManager.get_value(key, 0)
	var is_new_high = score > high
	if is_new_high:
		SaveManager.set_value(key, score)
		SaveManager.save_to_disk()
	final_score.text = str(score)
	high_score_label.text = "Best: " + str(max(score, high))
	stats_label.text = "Perfects: " + str(perfect_count) + "  |  Max Combo: " + str(max_combo) + "x"
	game_over_ui.visible = true
	game_over_ui.modulate.a = 0.0
	var tween = create_tween()
	tween.tween_interval(0.5)
	tween.tween_property(game_over_ui, "modulate:a", 1.0, 0.5)
	AchievementManager.progress("games_5" if GameManager.session_count >= 5 else "games_25" if GameManager.session_count >= 25 else "")
	AdsManager.show_interstitial("game_over")
	AnalyticsManager.track_event("game_over", {"game_id": game_id, "score": score, "perfects": perfect_count, "max_combo": max_combo})

func _on_continue() -> void:
	if not can_continue: return
	can_continue = false
	continue_btn.disabled = true
	continue_btn.text = "Loading..."
	AdsManager.show_rewarded("continue_revive")

func _on_bonus_ad() -> void:
	## Show a rewarded ad in exchange for bonus coins (game-over only).
	if not AdsManager.show_rewarded("bonus_coins"):
		return
	_pending_bonus = true
	bonus_btn.disabled = true
	bonus_btn.text = "Loading..."
	AnalyticsManager.track_event("bonus_ad_requested", {"score": score})

func _on_ad_rewarded(amount: int, currency: String) -> void:
	if _pending_bonus:
		_pending_bonus = false
		var coin_bonus = 100 + int(score * 0.1)
		GameManager.add_currency(coin_bonus, "coins", "bonus_ad")
		bonus_btn.text = "+" + str(coin_bonus) + " coins!"
		AnalyticsManager.track_event("bonus_ad_rewarded", {"coins": coin_bonus, "score": score})
		await get_tree().create_timer(3.0).timeout
		bonus_btn.disabled = true
		bonus_btn.text = "✅ Claimed"
	elif phase == GamePhase.GAME_OVER and not has_revived:
		_continue_game()

func _continue_game() -> void:
	has_revived = true
	phase = GamePhase.PLAYING
	game_over_ui.visible = false
	continue_btn.disabled = false
	continue_btn.text = "Continue (Ad)"
	if archetype == Archetype.STACK and tower_blocks.size() > 1:
		var last = tower_blocks.pop_back()
		last.queue_free()
		blocks_placed -= 1
		last_block_x = tower_blocks[-1].position.x
	audio_mgr.play_placement()
	audio_mgr.start_music()
	if archetype == Archetype.STACK:
		_spawn_block()
	AnalyticsManager.track_event("revived", {"score": score, "game": game_id})

func _on_restart() -> void:
	audio_mgr.stop_music()
	get_tree().reload_current_scene()

func _on_menu() -> void:
	audio_mgr.stop_music()
	get_tree().change_scene_to_file("res://hub/hub.tscn")

func _on_power_slowmo() -> void:
	if archetype == Archetype.MATCH:
		_power_shuffle()
		return
	if slowmo_active or power_charge["slowmo"] < 100.0:
		return
	slowmo_active = true
	speed_multiplier = 0.4
	power_charge["slowmo"] = 0.0
	_refresh_power_buttons()
	audio_mgr.play_powerup()
	if archetype == Archetype.TAP:
		tap_marker_speed *= 0.5
	var t = get_tree().create_timer(SLOWMO_DURATION)
	t.timeout.connect(func():
		slowmo_active = false
		speed_multiplier = 1.0
		if archetype == Archetype.TAP:
			tap_marker_speed = TAP_BASE_SPEED + level * 24.0
		_refresh_power_buttons())

func _on_power_widen() -> void:
	if archetype == Archetype.MATCH:
		_power_bomb()
		return
	if power_charge["widen"] < 100.0:
		return
	power_charge["widen"] = 0.0
	_refresh_power_buttons()
	audio_mgr.play_powerup()
	if archetype == Archetype.STACK:
		BLOCK_WIDTH = min(MAX_BLOCK_WIDTH, BLOCK_WIDTH + 35)
		particle_mgr.burst(ParticleManager.EffectType.LEVEL_UP, Vector2(get_viewport_rect().size.x / 2, last_block_y), Color.CYAN, 10)
	else:
		tap_zone_width = min(420.0, tap_zone_width + 90)
		var t = get_tree().create_timer(SLOWMO_DURATION + 2.0)
		t.timeout.connect(func(): tap_zone_width = TAP_ZONE_WIDTH)

func _on_power_ghost() -> void:
	if archetype == Archetype.MATCH:
		_power_color()
		return
	if ghost_active or power_charge["ghost"] < 100.0:
		return
	ghost_active = true
	power_charge["ghost"] = 0.0
	_refresh_power_buttons()
	audio_mgr.play_powerup()
	var t = get_tree().create_timer(GHOST_DURATION)
	t.timeout.connect(func():
		ghost_active = false
		if archetype == Archetype.STACK:
			ghost_preview.visible = false
		_refresh_power_buttons())

# ===================== STACK =====================

func _spawn_initial_blocks() -> void:
	if archetype != Archetype.STACK:
		return
	var base = _create_block(Vector2(get_viewport_rect().size.x / 2, 640), true, BLOCK_WIDTH, BlockKind.NORMAL)
	last_block_x = base.position.x
	last_block_y = base.position.y
	tower_blocks.append(base)

func _roll_kind() -> BlockKind:
	if blocks_placed > 0 and blocks_placed % 7 == 0:
		var cycle = (blocks_placed / 7) % 3
		if cycle == 0: return BlockKind.GOLDEN
		if cycle == 1: return BlockKind.FRAGILE
		return BlockKind.BOMB
	return BlockKind.NORMAL

func _spawn_block() -> void:
	var kind = _roll_kind()
	var w = BLOCK_WIDTH
	if kind == BlockKind.FRAGILE:
		w *= 0.7
	var spawn_x = get_viewport_rect().size.x / 2
	var spawn_y = $BlockSpawner.position.y
	var block = _create_block(Vector2(spawn_x, spawn_y), false, w, kind)
	var spd = move_speed * (1.0 if kind != BlockKind.FRAGILE else 1.3)
	block.linear_velocity = Vector2(move_direction * spd, 0)
	block.gravity_scale = 0.0
	current_block = block
	move_direction = 1 if randf() > 0.5 else -1

func _kind_color(kind: BlockKind, hue: float) -> Color:
	match kind:
		BlockKind.GOLDEN: return Color.GOLD
		BlockKind.FRAGILE: return Color(0.4, 0.9, 1.0)
		BlockKind.BOMB: return Color(0.9, 0.25, 0.25)
		_: return palette[int(hue * palette.size()) % palette.size()] if palette.size() > 0 else Color.from_hsv(hue, 0.7, 0.9)

func _create_block(pos: Vector2, is_placed: bool, width: float = BLOCK_WIDTH, kind: BlockKind = BlockKind.NORMAL) -> RigidBody2D:
	var block = RigidBody2D.new()
	block.position = pos
	block.rotation = randf_range(-0.5, 0.5) if not is_placed else 0.0
	var hue = (tower_blocks.size() % 60) / 60.0
	var color = _kind_color(kind, hue)
	var visual = PremiumKit.make_block(width, BLOCK_HEIGHT, color, true)
	block.add_child(visual)
	block.set_meta("kind", kind)
	block.set_meta("width", width)
	var collision = CollisionShape2D.new()
	var shape = RectangleShape2D.new()
	shape.size = Vector2(width, BLOCK_HEIGHT)
	collision.shape = shape
	block.add_child(collision)
	if is_placed:
		block.freeze = true
		block.gravity_scale = 0.0
	tower_container.add_child(block)
	return block

func _drop_block() -> void:
	if not current_block:
		return
	var drop_pos = current_block.position
	current_block.gravity_scale = 1.2
	current_block.linear_velocity = Vector2(0, 600)
	current_block = null
	particle_mgr.burst(ParticleManager.EffectType.SMOKE_PUFF, drop_pos, Color.WHITE, 5)
	await get_tree().create_timer(0.35).timeout
	_check_placement()

func _check_placement() -> void:
	if tower_blocks.is_empty():
		return
	var top = tower_blocks[-1]
	var dropped_x = top.position.x
	var offset = abs(dropped_x - last_block_x)
	blocks_placed += 1

	if offset < PERFECT_THRESHOLD:
		_on_perfect(dropped_x)
	elif offset < BLOCK_WIDTH:
		_on_partial(dropped_x, offset, top, BLOCK_WIDTH)
	else:
		_game_over()
		return

	_advance_difficulty()
	_show_score()
	_spawn_block()

func _on_perfect(dropped_x: float) -> void:
	var mult = 1.0 + combo * 0.5
	if fever_active: mult *= 2.0
	var bonus = int(floor(10 * PERFECT_BONUS_MULTIPLIER * mult))
	_add_score(bonus)
	combo += 1
	perfect_count += 1
	if combo > max_combo: max_combo = combo
	last_block_x = dropped_x

	_show_perfect_flash()
	_show_combo()
	screen_shake.burst(0.2, 0.15)
	particle_mgr.burst(ParticleManager.EffectType.SPARKLE, Vector2(dropped_x, last_block_y), Color.GOLD, 8 + combo)
	audio_mgr.play_perfect()

	_register_power_and_fever()
	_handle_special_bonus()

	AchievementManager.progress("perfect_1")
	if perfect_count == 5: AchievementManager.progress("perfect_5")
	if perfect_count == 20: AchievementManager.progress("perfect_20")
	AnalyticsManager.track_event("perfect_placement", {"game_id": game_id, "combo": combo, "fever": fever_active})

func _on_partial(dropped_x: float, offset: float, top_block: RigidBody2D, current_width: float) -> void:
	var overlap = current_width - offset
	var mult = 1.0 + combo * 0.25
	if fever_active: mult *= 2.0
	var points = int(floor(5 * (overlap / current_width) * mult))
	_add_score(max(points, 1))
	combo = 0

	var visual = top_block.get_child(0)
	var full_w = float(top_block.get_meta("width", current_width))
	if visual: visual.scale.x = overlap / full_w
	var collision = _find_collision(top_block)
	if collision and collision.shape is RectangleShape2D:
		(collision.shape as RectangleShape2D).size.x = overlap

	last_block_x = dropped_x - sign(offset) * ((current_width - overlap) / 2)
	last_block_y = top_block.position.y

	if offset > 15:
		particle_mgr.burst(ParticleManager.EffectType.DEBRIS,
			Vector2(dropped_x + sign(offset) * overlap / 2, last_block_y),
			palette[int((tower_blocks.size() % 60) / 60.0 * palette.size()) % palette.size()], 4)
	audio_mgr.play_placement()

	if top_block.get_meta("kind", BlockKind.NORMAL) == BlockKind.BOMB:
		BLOCK_WIDTH = min(MAX_BLOCK_WIDTH, BLOCK_WIDTH + 25)
		particle_mgr.burst(ParticleManager.EffectType.LEVEL_UP, Vector2(dropped_x, last_block_y), Color.ORANGE, 10)
	BLOCK_WIDTH = overlap
	_handle_special_bonus()
	AnalyticsManager.track_event("block_placed", {"game_id": game_id, "width": overlap, "score": score})

func _handle_special_bonus() -> void:
	var kind = tower_blocks[-1].get_meta("kind", BlockKind.NORMAL)
	if kind == BlockKind.GOLDEN:
		_add_score(40)
		particle_mgr.burst(ParticleManager.EffectType.SPARKLE, Vector2(last_block_x, last_block_y), Color.GOLD, 12)
		audio_mgr.play_coin()

func _find_collision(node: Node) -> CollisionShape2D:
	for c in node.get_children():
		if c is CollisionShape2D:
			return c
	return null

func _advance_difficulty() -> void:
	if blocks_placed > 0 and blocks_placed % 5 == 0:
		level += 1
		move_speed = BASE_SPEED + (level * SPEED_PER_LEVEL)
		if not fever_active and not slowmo_active:
			BLOCK_WIDTH = max(MIN_BLOCK_WIDTH, BLOCK_WIDTH - NARROW_PER_LEVEL)
		level_label.text = "LV " + str(level + 1)
		var tween = create_tween()
		level_label.scale = Vector2(1.5, 1.5)
		tween.tween_property(level_label, "scale", Vector2(1.0, 1.0), 0.4)
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_BACK)
		if blocks_placed % 25 == 0:
			_milestone_celebrate(blocks_placed)
		match blocks_placed:
			10: AchievementManager.progress("tower_10")
			25: AchievementManager.progress("tower_25")
			50: AchievementManager.progress("tower_50")
			100: AchievementManager.progress("tower_100")
		AnalyticsManager.track_event("level_up", {"game_id": game_id, "level": level, "blocks": blocks_placed})

func _process_stack(delta: float) -> void:
	if not current_block:
		return
	var pos = current_block.position
	var eff_speed = move_speed * speed_multiplier * (1.0 if not fever_active else 0.7)
	pos.x += move_direction * eff_speed * delta
	var screen_w = get_viewport_rect().size.x
	var half = BLOCK_WIDTH / 2.0
	if pos.x > screen_w - half:
		pos.x = screen_w - half
		move_direction = -1
	elif pos.x < half:
		pos.x = half
		move_direction = 1
	current_block.position = pos
	_update_aim()

func _update_aim() -> void:
	aim_guide.visible = true
	var x = current_block.position.x
	aim_guide.points = PackedVector2Array([Vector2(x, -720), Vector2(x, 720)])
	if ghost_active:
		ghost_preview.visible = true
		var hw = BLOCK_WIDTH / 2.0
		var ty = last_block_y - BLOCK_HEIGHT
		ghost_preview.default_color = _offset_color(x)
		ghost_preview.points = PackedVector2Array([
			Vector2(x - hw, ty - BLOCK_HEIGHT / 2.0),
			Vector2(x + hw, ty - BLOCK_HEIGHT / 2.0),
			Vector2(x + hw, ty + BLOCK_HEIGHT / 2.0),
			Vector2(x - hw, ty + BLOCK_HEIGHT / 2.0),
			Vector2(x - hw, ty - BLOCK_HEIGHT / 2.0)
		])
	else:
		ghost_preview.visible = false

func _offset_color(x: float) -> Color:
	var off = abs(x - last_block_x)
	if off < PERFECT_THRESHOLD:
		return Color(0.2, 1.0, 0.3, 0.75)
	elif off < BLOCK_WIDTH:
		return Color(1.0, 0.85, 0.2, 0.7)
	return Color(1.0, 0.25, 0.25, 0.7)

# ===================== TAP =====================

func _setup_tap() -> void:
	tap_track = ColorRect.new()
	tap_track.color = Color(1, 1, 1, 0.08)
	tap_track.position = Vector2(TAP_MARGIN, 900)
	tap_track.size = Vector2(get_viewport_rect().size.x - 2 * TAP_MARGIN, 120)
	world.add_child(tap_track)

	tap_zone_rect = ColorRect.new()
	tap_zone_rect.color = accent
	tap_zone_rect.modulate.a = 0.35
	world.add_child(tap_zone_rect)

	tap_marker = PremiumKit.make_block(60, 100, Color.WHITE, false)
	world.add_child(tap_marker)

	tap_ghost_line = ColorRect.new()
	tap_ghost_line.color = Color(1, 1, 1, 0.0)
	tap_ghost_line.size = Vector2(4, 120)
	world.add_child(tap_ghost_line)

func _reset_tap() -> void:
	level = 0
	tap_marker_speed = TAP_BASE_SPEED
	tap_zone_width = TAP_ZONE_WIDTH
	tap_zone_center = get_viewport_rect().size.x / 2.0
	tap_marker_x = TAP_MARGIN
	tap_dir = 1
	_update_tap_visuals()

func _update_tap_visuals() -> void:
	if not tap_zone_rect: return
	tap_zone_rect.position = Vector2(tap_zone_center - tap_zone_width / 2.0, 905)
	tap_zone_rect.size = Vector2(tap_zone_width, 110)
	if tap_marker:
		tap_marker.position = Vector2(tap_marker_x, 955)
	if ghost_active and tap_ghost_line:
		tap_ghost_line.position = Vector2(tap_zone_center - 2, 905)
		tap_ghost_line.modulate.a = 0.8
	elif tap_ghost_line:
		tap_ghost_line.modulate.a = 0.0

func _process_tap(delta: float) -> void:
	tap_marker_x += tap_dir * tap_marker_speed * delta
	var left = TAP_MARGIN
	var right = get_viewport_rect().size.x - TAP_MARGIN
	if tap_marker_x > right:
		tap_marker_x = right
		tap_dir = -1
	elif tap_marker_x < left:
		tap_marker_x = left
		tap_dir = 1
	_update_tap_visuals()

func _tap_hit() -> void:
	var dist = abs(tap_marker_x - tap_zone_center)
	var half = tap_zone_width / 2.0
	if dist < half * 0.4:
		_on_tap_perfect()
	elif dist < half:
		_on_tap_good()
	else:
		_on_tap_miss()

func _on_tap_perfect() -> void:
	var mult = 1.0 + combo * 0.3
	if fever_active: mult *= 2.0
	_add_score(int(floor(20 * mult)))
	combo += 1
	perfect_count += 1
	if combo > max_combo: max_combo = combo
	_show_perfect_flash()
	_show_combo()
	screen_shake.burst(0.2, 0.15)
	particle_mgr.burst(ParticleManager.EffectType.SPARKLE, Vector2(tap_marker_x, 955), accent, 8 + combo)
	audio_mgr.play_perfect()
	_register_power_and_fever()
	AchievementManager.progress("perfect_1")
	if perfect_count == 5: AchievementManager.progress("perfect_5")
	if perfect_count == 20: AchievementManager.progress("perfect_20")
	_level_tap()

func _on_tap_good() -> void:
	var mult = 1.0 + combo * 0.15
	if fever_active: mult *= 2.0
	_add_score(int(floor(8 * mult)))
	_show_combo()
	audio_mgr.play_placement()
	_register_power_and_fever()

func _on_tap_miss() -> void:
	combo = 0
	misses += 1
	audio_mgr.play_placement()
	screen_shake.burst(0.25, 0.2)
	particle_mgr.burst(ParticleManager.EffectType.DEBRIS, Vector2(tap_marker_x, 955), Color.RED, 6)
	if misses >= TAP_MAX_MISSES:
		_game_over("misses")
	else:
		stats_label.text = "Misses: " + str(misses) + "/" + str(TAP_MAX_MISSES)

func _level_tap() -> void:
	if perfect_count > 0 and perfect_count % 8 == 0:
		level += 1
		tap_marker_speed = TAP_BASE_SPEED + level * 24.0
		level_label.text = "LV " + str(level + 1)
		if perfect_count % 24 == 0:
			_milestone_celebrate(perfect_count)

# ===================== MATCH =====================

func _setup_match() -> void:
	match_tile_size = min(120.0, (get_viewport_rect().size.x - 120.0) / MATCH_COLS)
	var grid_w = match_tile_size * MATCH_COLS
	var grid_h = match_tile_size * MATCH_ROWS
	match_origin = Vector2((get_viewport_rect().size.x - grid_w) / 2.0, 360.0)
	var board = ColorRect.new()
	board.color = Color(0, 0, 0, 0.25)
	board.position = Vector2(match_origin.x - 10, match_origin.y - 10)
	board.size = Vector2(grid_w + 20, grid_h + 20)
	world.add_child(board)

func _reset_match() -> void:
	# Clear old tiles
	for row in match_tiles:
		for t in row:
			if t: t.queue_free()
	match_tiles = []
	for r in range(MATCH_ROWS):
		var row_arr: Array = []
		for c in range(MATCH_COLS):
			var col = palette[int(randf() * palette.size()) % palette.size()]
			var btn = _make_tile(col)
			btn.position = match_origin + Vector2(c * match_tile_size, r * match_tile_size)
			btn.pressed.connect(_on_tile_pressed.bind(c, r))
			world.add_child(btn)
			row_arr.append(btn)
		match_tiles.append(row_arr)
	level_label.text = "MOVES"
	stats_label.text = ""

func _make_tile(color: Color) -> Button:
	var btn = Button.new()
	btn.custom_minimum_size = Vector2(match_tile_size - 4, match_tile_size - 4)
	btn.size = Vector2(match_tile_size - 4, match_tile_size - 4)
	btn.flat = false
	var sb = StyleBoxFlat.new()
	sb.bg_color = color
	sb.corner_radius_top_left = 10
	sb.corner_radius_top_right = 10
	sb.corner_radius_bottom_left = 10
	sb.corner_radius_bottom_right = 10
	sb.border_width_left = 2
	sb.border_width_right = 2
	sb.border_width_top = 2
	sb.border_width_bottom = 2
	sb.border_color = color.lightened(0.3)
	btn.add_theme_stylebox_override("normal", sb)
	btn.add_theme_stylebox_override("hover", sb)
	btn.add_theme_stylebox_override("pressed", sb)
	btn.set_meta("color", color)
	return btn

func _tile_color(c: int, r: int) -> Color:
	var t = match_tiles[r][c]
	return t.get_meta("color", Color.WHITE) if t else Color.WHITE

func _on_tile_pressed(c: int, r: int) -> void:
	if phase != GamePhase.PLAYING:
		return
	match_last = Vector2i(c, r)
	var group = _flood(c, r)
	if group.size() < 2:
		return
	var pts = group.size() * (group.size() - 1) * MATCH_BASE_POINTS
	if fever_active: pts *= 2
	_add_score(pts)
	combo += 1
	if combo > max_combo: max_combo = combo
	perfect_count += 1
	_show_combo()
	audio_mgr.play_perfect()
	screen_shake.burst(0.15, 0.1)
	for cell in group:
		var t = match_tiles[cell.y][cell.x]
		if t:
			particle_mgr.burst(ParticleManager.EffectType.SPARKLE, t.global_position + Vector2(match_tile_size/2, match_tile_size/2), _tile_color(cell.x, cell.y), 4)
			t.queue_free()
			match_tiles[cell.y][cell.x] = null
	_register_power_and_fever()
	AchievementManager.progress("perfect_1")
	if perfect_count == 5: AchievementManager.progress("perfect_5")
	if perfect_count == 20: AchievementManager.progress("perfect_20")
	_apply_gravity()
	await get_tree().create_timer(0.05).timeout
	if not _has_moves():
		_game_over("no_moves")

func _flood(c: int, r: int) -> Array:
	var target = _tile_color(c, r)
	var seen: Dictionary = {}
	var stack: Array = [Vector2i(c, r)]
	var result: Array = []
	while not stack.is_empty():
		var cell = stack.pop_back()
		if seen.has(cell): continue
		seen[cell] = true
		if cell.x < 0 or cell.x >= MATCH_COLS or cell.y < 0 or cell.y >= MATCH_ROWS:
			continue
		if match_tiles[cell.y][cell.x] == null:
			continue
		if _tile_color(cell.x, cell.y) != target:
			continue
		result.append(cell)
		stack.append(Vector2i(cell.x + 1, cell.y))
		stack.append(Vector2i(cell.x - 1, cell.y))
		stack.append(Vector2i(cell.x, cell.y + 1))
		stack.append(Vector2i(cell.x, cell.y - 1))
	return result

func _apply_gravity() -> void:
	for c in range(MATCH_COLS):
		var write = MATCH_ROWS - 1
		for r in range(MATCH_ROWS - 1, -1, -1):
			if match_tiles[r][c] != null:
				if write != r:
					var t = match_tiles[r][c]
					match_tiles[write][c] = t
					match_tiles[r][c] = null
					t.position = match_origin + Vector2(c * match_tile_size, write * match_tile_size)
				write -= 1

func _has_moves() -> bool:
	for r in range(MATCH_ROWS):
		for c in range(MATCH_COLS):
			if match_tiles[r][c] == null:
				continue
			var col = _tile_color(c, r)
			if c + 1 < MATCH_COLS and match_tiles[r][c+1] != null and _tile_color(c+1, r) == col:
				return true
			if r + 1 < MATCH_ROWS and match_tiles[r+1][c] != null and _tile_color(c, r+1) == col:
				return true
	return false

func _power_shuffle() -> void:
	if power_charge["slowmo"] < 100.0:
		return
	power_charge["slowmo"] = 0.0
	_refresh_power_buttons()
	audio_mgr.play_powerup()
	var colors: Array = []
	for r in range(MATCH_ROWS):
		for c in range(MATCH_COLS):
			if match_tiles[r][c] != null:
				colors.append(_tile_color(c, r))
	colors.shuffle()
	var i = 0
	for r in range(MATCH_ROWS):
		for c in range(MATCH_COLS):
			if match_tiles[r][c] != null:
				var col = colors[i]; i += 1
				var t = match_tiles[r][c]
				t.set_meta("color", col)
				var sb = t.get_theme_stylebox("normal")
				if sb is StyleBoxFlat:
					(sb as StyleBoxFlat).bg_color = col
					(sb as StyleBoxFlat).border_color = col.lightened(0.3)

func _power_bomb() -> void:
	if power_charge["widen"] < 100.0 or match_last.x < 0:
		return
	power_charge["widen"] = 0.0
	_refresh_power_buttons()
	audio_mgr.play_powerup()
	for dr in range(-1, 2):
		for dc in range(-1, 2):
			var c = match_last.x + dc
			var r = match_last.y + dr
			if c >= 0 and c < MATCH_COLS and r >= 0 and r < MATCH_ROWS and match_tiles[r][c] != null:
				var t = match_tiles[r][c]
				particle_mgr.burst(ParticleManager.EffectType.SPARKLE, t.global_position + Vector2(match_tile_size/2, match_tile_size/2), _tile_color(c, r), 4)
				t.queue_free()
				match_tiles[r][c] = null
	_add_score(40)
	_apply_gravity()

func _power_color() -> void:
	if power_charge["ghost"] < 100.0 or match_last.x < 0:
		return
	var col = _tile_color(match_last.x, match_last.y)
	power_charge["ghost"] = 0.0
	_refresh_power_buttons()
	audio_mgr.play_powerup()
	for r in range(MATCH_ROWS):
		for c in range(MATCH_COLS):
			if match_tiles[r][c] != null and _tile_color(c, r) == col:
				var t = match_tiles[r][c]
				particle_mgr.burst(ParticleManager.EffectType.SPARKLE, t.global_position + Vector2(match_tile_size/2, match_tile_size/2), col, 3)
				t.queue_free()
				match_tiles[r][c] = null
	_add_score(30)
	_apply_gravity()
