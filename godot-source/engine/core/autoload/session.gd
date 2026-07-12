extends Node
## Session — carries the selected game definition from the Hub into the core scene.
var current_def: Dictionary = {}
var last_score: int = 0
var parent_approved: bool = false
var parent_approved_time: float = 0.0
