import pytest

from pck_feedback.models.registry import get_adapter
from pck_feedback.models.run_config import RunConfig


def test_get_adapter_unknown_provider_raises():
    config = RunConfig(run_id="x", provider="anthropic_totally_unsupported", model_name="m")
    with pytest.raises(ValueError, match="Unknown provider"):
        get_adapter(config)


def test_get_adapter_vertex_gemini_without_extra_installed_raises_actionable_error():
    """
    We don't install the 'vertex' extra in the test venv (fixture tests must
    stay network/credential-free), so this should raise a clear config
    error pointing at the missing optional dependency / missing env vars --
    not a bare ImportError or AttributeError.
    """
    config = RunConfig(run_id="x", provider="vertex_gemini", model_name="gemini-2.5-flash-lite")
    with pytest.raises(Exception) as exc_info:
        get_adapter(config)
    assert "vertex" in str(exc_info.value).lower() or "google-cloud-aiplatform" in str(exc_info.value)


def test_get_adapter_openai_compatible_without_extra_installed_raises_actionable_error():
    config = RunConfig(run_id="x", provider="openai_compatible", model_name="gpt-4o-mini")
    with pytest.raises(Exception) as exc_info:
        get_adapter(config)
    assert "openai" in str(exc_info.value).lower()
