"""
A fully offline, dependency-free fake tokenizer for testing
`training/train_sft.py`'s tokenizer-shaped logic (response-template
derivation, length measurement) without needing `transformers` installed or
any network access to download a real tokenizer.

Mimics just enough of a Hugging Face `PreTrainedTokenizer`'s surface
(`apply_chat_template`, `encode`, `pad_token_id`, `eos_token_id`) using a
ChatML-style template (same family as Qwen2.5's), since only that surface
is used by `train_sft.py`.
"""

from __future__ import annotations

import re
from typing import Any

# Special "tokens" always split off atomically (like real special/reserved
# tokens are, regardless of adjacent whitespace), plus "\n" so a role header
# like "<|im_start|>assistant\n" decomposes the same way whether it's
# standalone (the derived response template) or immediately followed by
# content with no separating space (as in a real rendered turn).
_SPECIAL_RE = re.compile(r"(<\|im_start\|>|<\|im_end\|>|\n)")


class FakeChatTemplateTokenizer:
    pad_token: None = None  # forces train_sft.py's "fall back to eos_token" path, like a real tokenizer might
    eos_token = "<eos>"
    pad_token_id = 0
    eos_token_id = 1

    def __init__(self) -> None:
        self._vocab: dict[str, int] = {}

    def _token_id(self, token: str) -> int:
        # +2 so fake token ids never collide with pad_token_id=0 / eos_token_id=1.
        return self._vocab.setdefault(token, len(self._vocab) + 2)

    def _tokenize_text(self, text: str) -> list[int]:
        tokens: list[str] = []
        for chunk in _SPECIAL_RE.split(text):
            if not chunk:
                continue
            if chunk in ("<|im_start|>", "<|im_end|>", "\n"):
                tokens.append(chunk)
            else:
                tokens.extend(word for word in chunk.split(" ") if word)
        return [self._token_id(tok) for tok in tokens]

    def _render(self, messages: list[dict[str, str]], add_generation_prompt: bool) -> str:
        parts = [f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n" for m in messages]
        text = "".join(parts)
        if add_generation_prompt:
            text += "<|im_start|>assistant\n"
        return text

    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        *,
        tokenize: bool = True,
        add_generation_prompt: bool = False,
    ) -> Any:
        text = self._render(messages, add_generation_prompt)
        return self._tokenize_text(text) if tokenize else text

    def encode(self, text: str, add_special_tokens: bool = False) -> list[int]:
        return self._tokenize_text(text)
