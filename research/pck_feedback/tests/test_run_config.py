from pathlib import Path

CONFIG_DIR = Path(__file__).parent.parent / "config" / "runs"

from pck_feedback.models.run_config import RunConfig  # noqa: E402


def test_load_baseline_gemini_text_only_config():
    config = RunConfig.from_yaml(CONFIG_DIR / "baseline_gemini_text_only.yaml")
    assert config.run_id == "baseline_gemini_text_only"
    assert config.provider == "vertex_gemini"
    assert config.model_name == "gemini-2.5-flash-lite"
    assert config.include_board_images is False
    assert config.generation["temperature"] == 0.7
    assert config.provider_config == {}


def test_load_baseline_gemini_with_board_images_config():
    config = RunConfig.from_yaml(CONFIG_DIR / "baseline_gemini_with_board_images.yaml")
    assert config.run_id == "baseline_gemini_with_board_images"
    assert config.include_board_images is True


def test_load_baseline_openai_compat_config():
    config = RunConfig.from_yaml(CONFIG_DIR / "baseline_openai_compat.yaml")
    assert config.provider == "openai_compatible"
    assert config.model_name == "gpt-4o-mini"


def test_from_yaml_captures_unknown_keys_as_provider_config(tmp_path: Path):
    yaml_text = """
run_id: custom_run
provider: openai_compatible
model_name: some-model
base_url: http://localhost:8000/v1
api_key: not-needed
"""
    path = tmp_path / "custom.yaml"
    path.write_text(yaml_text, encoding="utf-8")

    config = RunConfig.from_yaml(path)
    assert config.provider_config == {"base_url": "http://localhost:8000/v1", "api_key": "not-needed"}
