"""
Locks for External Gameplay Validation.

VIDEO_OUTCOME_UNLOCKED is authorized only for Outcome Audit v3
endgame visual/spoken outcome recovery. Mechanism analysis stays sealed.
"""

from __future__ import annotations

OUTCOME_UNLOCKED = True
TRANSCRIPT_UNLOCKED = False
TRANSCRIPT_OUTCOME_UNLOCKED = True
TRANSCRIPT_MECHANISM_UNLOCKED = True
TRANSCRIPT_MECHANISM_UNLOCK_SCOPE = "observed-mechanism-validation-v1"
VIDEO_OUTCOME_UNLOCKED = True
OUTCOME_UNLOCK_SCOPE = "external-gameplay-outcome-audit-v3-video-assisted-endgame"
TOPDECK_HOLDOUT_WINNER_UNLOCKED = True
TOPDECK_HOLDOUT_UNLOCK_SCOPE = "topdeck-holdout-outcome-validation-v1"
ODSG_V1_TRAINING_AUTHORIZED = True
ODSG_V1_DEV_WINNER_UNLOCKED = True
ODSG_V1_VAL_WINNER_UNLOCKED = True
ODSG_V1_DEV_VAL_WINNER_UNLOCKED = True
ODSG_V1_FINAL_TEST_WINNER_UNLOCKED = True
ODSG_V1_FINAL_PREDICTIONS_FROZEN = True
ODSG_V1_LINEAGE_CLOSED = True
ODSG_V1_CYCLE_GEOMETRY_AUTHORIZED = False
ODSG_V1_INTERACTION_MATRIX_INSPECTION_AUTHORIZED = False
ODSG_V1_SCOPE = "outcome-derived-strategic-geometry-v1"
ODSG_V1_FINAL_CALL = "SG3_INTERACTION_MODEL_WORSE"
CMMG_V1_TRAINING_AUTHORIZED = False
CMMG_V1_SPENT_DEVELOPMENT_AUTHORIZED = True
CMMG_V1_RESERVED_WINNER_UNLOCKED = False
CMMG_V1_MODELS_FROZEN = True
CMMG_V1_PRIMARY_ELIGIBLE_SET_FROZEN = True
CMMG_V1_ACCUMULATION_AUTHORIZED = True
CMMG_V1_SCORING_AUTHORIZED = False
CMMG_V1_PREDICTION_FREEZE_AUTHORIZED = False
CMMG_V1_INTERACTION_INSPECTION_AUTHORIZED = False
CMMG_V1_DEV_WINNER_UNLOCKED = False
CMMG_V1_VAL_WINNER_UNLOCKED = False
CMMG_V1_FINAL_TEST_WINNER_UNLOCKED = False
CMMG_V1_SCOPE = "commander-meta-matchup-geometry-v1"
CMMG_V1_C1_SHA256 = "94394f46670d2bcb9b0df30502f64d6586c4f7cce33a513a355a8a7e10708105"
CMMG_V1_C2_SHA256 = "b1228394f21f88d87c10bb404e5c4dc501247cf60441510fcdc1da113cb26e87"
ODSG_V1_FINAL_TEST_FORBIDDEN_KEYS = (
    "winner",
    "winner_id",
    "winnerId",
    "winnerPlayerIdHash",
    "winnerDeckInstanceId",
    "winnerSeat",
    "placement",
    "standings",
    "finalStanding",
    "draw",
)


class OutcomeFirewallError(RuntimeError):
    pass


def assert_outcomes_locked() -> None:
    if OUTCOME_UNLOCKED:
        raise OutcomeFirewallError("OUTCOME_UNLOCKED is true; qualification/prediction must run locked.")


def assert_outcome_audit_gates() -> None:
    if not OUTCOME_UNLOCKED:
        raise OutcomeFirewallError("OUTCOME_UNLOCKED=false: outcome audit is not authorized.")
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise OutcomeFirewallError("Mechanism transcript unlock is not authorized.")


def assert_transcript_outcome_gates() -> None:
    if not TRANSCRIPT_OUTCOME_UNLOCKED:
        raise OutcomeFirewallError("TRANSCRIPT_OUTCOME_UNLOCKED=false: caption outcome recovery is sealed.")
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise OutcomeFirewallError("Mechanism transcript unlock is not authorized.")


def assert_video_outcome_gates() -> None:
    if not VIDEO_OUTCOME_UNLOCKED:
        raise OutcomeFirewallError("VIDEO_OUTCOME_UNLOCKED=false: video endgame recovery is sealed.")
    if TRANSCRIPT_UNLOCKED or TRANSCRIPT_MECHANISM_UNLOCKED:
        raise OutcomeFirewallError("Mechanism transcript unlock is not authorized.")


def require_outcomes_unlocked(action: str) -> None:
    if not OUTCOME_UNLOCKED:
        raise OutcomeFirewallError(f"OUTCOME_UNLOCKED=false: {action} is sealed until explicit reveal authorization.")


def require_transcripts_unlocked(action: str) -> None:
    if not TRANSCRIPT_UNLOCKED and not TRANSCRIPT_MECHANISM_UNLOCKED:
        raise OutcomeFirewallError(f"TRANSCRIPT_MECHANISM_UNLOCKED=false: {action} is sealed.")


def assert_omv1_mechanism_gates() -> None:
    if not TRANSCRIPT_MECHANISM_UNLOCKED:
        raise OutcomeFirewallError("TRANSCRIPT_MECHANISM_UNLOCKED=false: Observed Mechanism Validation is sealed.")
    if TRANSCRIPT_MECHANISM_UNLOCK_SCOPE != "observed-mechanism-validation-v1":
        raise OutcomeFirewallError("mechanism unlock scope is not observed-mechanism-validation-v1")


def require_transcript_outcome_unlocked(action: str) -> None:
    if not TRANSCRIPT_OUTCOME_UNLOCKED:
        raise OutcomeFirewallError(f"TRANSCRIPT_OUTCOME_UNLOCKED=false: {action} is sealed.")


def assert_topdeck_holdout_winners_locked() -> None:
    if TOPDECK_HOLDOUT_WINNER_UNLOCKED:
        raise OutcomeFirewallError(
            "TOPDECK_HOLDOUT_WINNER_UNLOCKED is true; holdout selection/prediction must run with winners masked."
        )


def assert_odsg_v1_training_locked() -> None:
    if ODSG_V1_TRAINING_AUTHORIZED:
        raise OutcomeFirewallError("ODSG_V1_TRAINING_AUTHORIZED is true; dataset freeze must run with training locked.")


def assert_odsg_v1_final_test_winners_locked() -> None:
    if ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise OutcomeFirewallError(
            "ODSG_V1_FINAL_TEST_WINNER_UNLOCKED is true; predictions must be frozen before FINAL_TEST winners are opened."
        )


def require_odsg_v1_training_authorized(action: str) -> None:
    if not ODSG_V1_TRAINING_AUTHORIZED:
        raise OutcomeFirewallError(f"ODSG_V1_TRAINING_AUTHORIZED=false: {action} is sealed.")
    if ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise OutcomeFirewallError("FINAL_TEST winners must stay locked during training.")


def require_odsg_v1_dev_winners_unlocked(action: str) -> None:
    if not ODSG_V1_DEV_WINNER_UNLOCKED:
        raise OutcomeFirewallError(f"ODSG_V1_DEV_WINNER_UNLOCKED=false: {action} is sealed.")


def require_odsg_v1_val_winners_unlocked(action: str) -> None:
    if not ODSG_V1_VAL_WINNER_UNLOCKED:
        raise OutcomeFirewallError(f"ODSG_V1_VAL_WINNER_UNLOCKED=false: {action} is sealed.")


def require_odsg_v1_dev_val_winners_unlocked(action: str) -> None:
    if not (ODSG_V1_DEV_WINNER_UNLOCKED and ODSG_V1_VAL_WINNER_UNLOCKED) and not ODSG_V1_DEV_VAL_WINNER_UNLOCKED:
        raise OutcomeFirewallError(f"ODSG DEV/VAL winners locked: {action} is sealed.")


def assert_odsg_v1_final_test_outcomes_absent(obj, path: str = "root") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ODSG_V1_FINAL_TEST_FORBIDDEN_KEYS:
                raise OutcomeFirewallError(f"FINAL_TEST outcome field {k!r} reached {path}")
            assert_odsg_v1_final_test_outcomes_absent(v, f"{path}.{k}")
    elif isinstance(obj, list) and obj and isinstance(obj[0], (dict, list)):
        for i, v in enumerate(obj[:8]):
            assert_odsg_v1_final_test_outcomes_absent(v, f"{path}[{i}]")


def refuse_final_test_winner_load(partition: str) -> None:
    if partition == "FINAL_TEST" and not ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise OutcomeFirewallError("refusing to load FINAL_TEST winners; ODSG_V1_FINAL_TEST_WINNER_UNLOCKED=false")


def require_odsg_v1_final_test_winners_unlocked(action: str) -> None:
    if not ODSG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise OutcomeFirewallError(f"ODSG_V1_FINAL_TEST_WINNER_UNLOCKED=false: {action} is sealed until model+prediction freeze.")


def assert_odsg_v1_lineage_closed() -> None:
    if not ODSG_V1_LINEAGE_CLOSED:
        raise OutcomeFirewallError("ODSG v1 lineage is not marked closed.")
    if ODSG_V1_FINAL_CALL != "SG3_INTERACTION_MODEL_WORSE":
        raise OutcomeFirewallError("ODSG v1 final call is not SG3_INTERACTION_MODEL_WORSE.")


def refuse_odsg_v1_cycle_geometry(action: str) -> None:
    if not ODSG_V1_CYCLE_GEOMETRY_AUTHORIZED:
        raise OutcomeFirewallError(
            f"OUTCOME_DERIVED_CYCLE_GEOMETRY_AUDIT_V1 is not authorized after SG3: {action}"
        )


def refuse_odsg_v1_interaction_matrix_inspection(action: str) -> None:
    if not ODSG_V1_INTERACTION_MATRIX_INSPECTION_AUTHORIZED:
        raise OutcomeFirewallError(f"I(A,B) inspection is not authorized after SG3: {action}")


def assert_cmmg_v1_training_locked() -> None:
    if CMMG_V1_TRAINING_AUTHORIZED:
        raise OutcomeFirewallError("CMMG_V1_TRAINING_AUTHORIZED is true; dataset freeze must run with training locked.")
    if CMMG_V1_DEV_WINNER_UNLOCKED or CMMG_V1_VAL_WINNER_UNLOCKED or CMMG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise OutcomeFirewallError("CMMG winner flags must stay false during dataset freeze.")


def assert_cmmg_v1_reserved_winners_locked() -> None:
    if CMMG_V1_RESERVED_WINNER_UNLOCKED or CMMG_V1_FINAL_TEST_WINNER_UNLOCKED:
        raise OutcomeFirewallError("CMMG reserved/future confirmatory winners must stay sealed.")


def refuse_cmmg_v1_reserved_winner_load(pod_id: str) -> None:
    if not CMMG_V1_RESERVED_WINNER_UNLOCKED:
        raise OutcomeFirewallError(f"refusing reserved/blinded corpus winner load: {pod_id}")


def refuse_cmmg_v1_interaction_geometry(action: str) -> None:
    if not CMMG_V1_INTERACTION_INSPECTION_AUTHORIZED:
        raise OutcomeFirewallError(f"CMMG I(c,d) geometry inspection is not authorized: {action}")


def assert_cmmg_v1_models_frozen() -> None:
    if not CMMG_V1_MODELS_FROZEN:
        raise OutcomeFirewallError("CMMG models are not frozen.")
    if CMMG_V1_TRAINING_AUTHORIZED:
        raise OutcomeFirewallError("CMMG retraining is not authorized after model freeze.")


def assert_cmmg_v1_scoring_locked() -> None:
    if CMMG_V1_SCORING_AUTHORIZED or CMMG_V1_PREDICTION_FREEZE_AUTHORIZED:
        raise OutcomeFirewallError("CMMG scoring/prediction freeze is not authorized before the confirmatory gate.")


def assert_cmmg_v1_accumulation_authorized() -> None:
    assert_cmmg_v1_models_frozen()
    assert_cmmg_v1_reserved_winners_locked()
    assert_cmmg_v1_scoring_locked()
    if not CMMG_V1_ACCUMULATION_AUTHORIZED:
        raise OutcomeFirewallError("CMMG prospective accumulation is not authorized.")
    if not CMMG_V1_PRIMARY_ELIGIBLE_SET_FROZEN:
        raise OutcomeFirewallError("CMMG primary-eligible commander set must stay frozen.")
    if CMMG_V1_INTERACTION_INSPECTION_AUTHORIZED:
        raise OutcomeFirewallError("CMMG interaction inspection must stay sealed during accumulation.")


def require_topdeck_holdout_winners_unlocked(action: str) -> None:
    if not TOPDECK_HOLDOUT_WINNER_UNLOCKED:
        raise OutcomeFirewallError(f"TOPDECK_HOLDOUT_WINNER_UNLOCKED=false: {action} is sealed until predictions freeze.")


def require_video_outcome_unlocked(action: str) -> None:
    if not VIDEO_OUTCOME_UNLOCKED:
        raise OutcomeFirewallError(f"VIDEO_OUTCOME_UNLOCKED=false: {action} is sealed.")


def extract_winner(*_a, **_k):
    require_outcomes_unlocked("winner extraction")


def extract_placements(*_a, **_k):
    require_outcomes_unlocked("placement extraction")


def extract_elimination_order(*_a, **_k):
    require_outcomes_unlocked("elimination-order extraction")


def extract_captions_for_outcome(*_a, **_k):
    require_transcript_outcome_unlocked("caption use for explicit outcome recovery")


def extract_video_endgame_for_outcome(*_a, **_k):
    require_video_outcome_unlocked("video endgame use for explicit outcome recovery")


def extract_transcript(*_a, **_k):
    require_transcripts_unlocked("transcript/mechanism extraction")


def extract_gameplay_summary(*_a, **_k):
    require_transcripts_unlocked("Gameplay Insights/Summary extraction")


def extract_comments(*_a, **_k):
    require_transcripts_unlocked("comment extraction")


def looks_like_transcript_query(text: str) -> bool:
    low = (text or "").lower()
    return any(h in low for h in ("comment",))


def looks_like_outcome_query(text: str) -> bool:
    return looks_like_transcript_query(text)
