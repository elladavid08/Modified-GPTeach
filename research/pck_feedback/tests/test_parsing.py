import json

from pck_feedback.inference.parsing import parse_model_response
from pck_feedback.pck_skills import PCK_DIMENSION_IDS, RUBRIC_VERSION
from pck_feedback.schemas.turn_example import TurnExample

VALID_RESPONSE = {
    "should_provide_feedback": True,
    "dimensions": {
        "p1": {"relevant": True, "score": 2, "feedback_text": "טקסט משוב"},
        "p2": {"relevant": False},
        "p3": {"relevant": False},
        "p4": {"relevant": True, "score": 1, "feedback_text": "עוד טקסט"},
        "p5": {"relevant": False},
    },
    "feedback_text_overall": "סיכום",
}


def _example() -> TurnExample:
    return TurnExample(
        example_id="conv_1__1",
        conversation_id="conv_1",
        session_id="conv_1",
        turn_number=1,
        teacher_message="הודעת מורה",
    )


def _parse(raw_text: str, **overrides):
    kwargs = dict(
        example=_example(),
        run_id="test_run",
        model_provider="fake_provider",
        model_name="fake-model",
        prompt_version="baseline_v1",
    )
    kwargs.update(overrides)
    return parse_model_response(raw_text, **kwargs)


def test_parse_valid_json_response():
    prediction = _parse(json.dumps(VALID_RESPONSE))

    assert prediction.parse_status == "ok"
    assert prediction.parse_error is None
    assert prediction.should_provide_feedback is True
    assert prediction.dimensions["p1"].relevant is True
    assert prediction.dimensions["p1"].score == 2
    assert prediction.dimensions["p1"].feedback_text == "טקסט משוב"
    assert prediction.dimensions["p2"].relevant is False
    assert prediction.dimensions["p2"].score is None
    assert set(prediction.dimensions.keys()) == set(PCK_DIMENSION_IDS)
    assert prediction.feedback_text_overall == "סיכום"
    assert prediction.rubric_version == RUBRIC_VERSION
    assert prediction.example_id == "conv_1__1"
    assert prediction.conversation_id == "conv_1"


def test_parse_strips_json_code_fences():
    fenced = f"```json\n{json.dumps(VALID_RESPONSE)}\n```"
    prediction = _parse(fenced)
    assert prediction.parse_status == "ok"
    assert prediction.should_provide_feedback is True


def test_parse_repairs_response_with_leading_and_trailing_prose():
    noisy = f"Sure, here is the analysis:\n{json.dumps(VALID_RESPONSE)}\nHope that helps!"
    prediction = _parse(noisy)
    assert prediction.parse_status == "repaired"
    assert prediction.should_provide_feedback is True


def test_parse_completely_invalid_text_fails_gracefully():
    prediction = _parse("this is not json at all")

    assert prediction.parse_status == "failed"
    assert prediction.parse_error is not None
    assert prediction.should_provide_feedback is False
    assert all(not dim.relevant for dim in prediction.dimensions.values())
    assert set(prediction.dimensions.keys()) == set(PCK_DIMENSION_IDS)
    # Never crashes, and always preserves the raw text for debugging.
    assert prediction.raw_model_output == "this is not json at all"


def test_parse_missing_dimensions_key_defaults_all_to_not_relevant():
    response = {"should_provide_feedback": False}
    prediction = _parse(json.dumps(response))
    assert prediction.parse_status == "ok"
    assert set(prediction.dimensions.keys()) == set(PCK_DIMENSION_IDS)
    assert all(not dim.relevant for dim in prediction.dimensions.values())


def test_parse_invalid_score_is_coerced_to_none():
    response = {
        "should_provide_feedback": True,
        "dimensions": {"p1": {"relevant": True, "score": 99, "feedback_text": "x"}},
    }
    prediction = _parse(json.dumps(response))
    assert prediction.dimensions["p1"].score is None  # 99 is not a valid 0/1/2 score


def test_parse_carries_latency_and_token_metadata_through():
    prediction = _parse(
        json.dumps(VALID_RESPONSE),
        latency_ms=123.4,
        prompt_tokens=100,
        completion_tokens=50,
    )
    assert prediction.latency_ms == 123.4
    assert prediction.prompt_tokens == 100
    assert prediction.completion_tokens == 50
