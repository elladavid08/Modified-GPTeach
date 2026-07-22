from pck_feedback.pck_skills import (
    PCK_DIMENSION_IDS,
    PCK_SKILLS,
    RESEARCH_ID_TO_SKILL_ID,
    RUBRIC_VERSION,
    SKILL_ID_TO_RESEARCH_ID,
    format_skills_for_prompt,
    get_skill,
)


def test_dimension_ids_are_p1_to_p5_in_order():
    assert PCK_DIMENSION_IDS == ("p1", "p2", "p3", "p4", "p5")


def test_rubric_version_is_a_non_empty_string():
    assert isinstance(RUBRIC_VERSION, str)
    assert RUBRIC_VERSION


def test_every_dimension_has_a_skill_mapping():
    for dim_id in PCK_DIMENSION_IDS:
        skill = get_skill(dim_id)
        assert skill["research_id"] == dim_id
        assert skill["skill_id"]
        assert RESEARCH_ID_TO_SKILL_ID[dim_id] == skill["skill_id"]
        assert SKILL_ID_TO_RESEARCH_ID[skill["skill_id"]] == dim_id


def test_production_skill_id_mapping_matches_known_taxonomy():
    expected = {
        "p1": "error-identification",
        "p2": "error-characterization",
        "p3": "diagnostic-interpretation",
        "p4": "adapted-pedagogical-response",
        "p5": "error-leveraging",
    }
    assert RESEARCH_ID_TO_SKILL_ID == expected


def test_every_skill_has_a_complete_0_1_2_rubric():
    for dim_id in PCK_DIMENSION_IDS:
        rubric = PCK_SKILLS[dim_id]["scoring_rubric"]
        assert set(rubric.keys()) == {0, 1, 2}
        for band in rubric.values():
            assert band["label"]
            assert band["description"]
            assert isinstance(band["hebrew_patterns"], list) and band["hebrew_patterns"]


def test_format_skills_for_prompt_mentions_every_dimension():
    text = format_skills_for_prompt()
    for dim_id in PCK_DIMENSION_IDS:
        assert f"**{dim_id}:" in text
    # Must not leak production's internal skill_id strings into the research prompt.
    for skill_id in RESEARCH_ID_TO_SKILL_ID.values():
        assert skill_id not in text
