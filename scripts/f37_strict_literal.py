#!/usr/bin/env python3
"""F3.7 strict lexical candidate reranking policy. NO model, LLM, or runtime integration.

Only promote literal text if, after stripping ONE approved requirement wrapper,
the WHOLE remaining clause is exactly ONE public catalog label. Incidental skill
mentions, long prose, combinations, negations and unknown labels abstain.
This only changes CANDIDATE RANK ORDER. It does not verify employment, vacancy
modality, PPKS evidence or professional experience.
"""
from __future__ import annotations
import re
import unicodedata

PREFIXES = (
    "experiencia com ", "experiencia em ", "conhecimento em ",
    "conhecimento de ", "dominio de ", "dominio em ",
    "habilidade em ", "proficiência em ", "proficiencia em ",
    "requisito obrigatorio ", "requisito desejavel ",
    "required ", "mandatory ", "desired ", "preferred ",
    "experience with ", "experience in ", "knowledge of ",
    "proficiency in ", "proficient in ", "must know ",
    "should know ", "familiarity with ", "skills in ",
)
SUFFIXES = (
    " e obrigatorio", " eh obrigatorio", " e desejavel",
    " is required", " is mandatory", " is preferred",
    " required", " mandatory", " preferred",
)
NEGATIVE_WORDS = re.compile(r"\b(nao|sem|dispensavel|dispensado|not|no|without|unless|except|negado)\b")
COMPOSITION_WORDS = re.compile(r"\b(e|ou|and|or|either|alternativamente)\b")


def normalize(text: str) -> str:
    decomp = unicodedata.normalize("NFKD", text)
    decomp = "".join(c for c in decomp if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", decomp.lower()).split())


def strict_literal_skill_id(text: str, catalog_skills: list[dict]) -> str | None:
    """A *single* literal skill; no fuzzy matching and no assertion of truth."""
    if not isinstance(text, str) or not isinstance(catalog_skills, list) or len(text) > 2000:
        return None
    value = normalize(text)
    if not value or NEGATIVE_WORDS.search(value):
        return None

    # Prefix/suffix scope is limited to the complete one-skill phrase.
    for pre in PREFIXES:
        pre = normalize(pre) + " "
        if value.startswith(pre):
            value = value[len(pre):]
            break
    for suff in SUFFIXES:
        suff = normalize(suff)
        if value.endswith(" " + suff):
            value = value[:-(len(suff) + 1)]
            break

    if COMPOSITION_WORDS.search(value):
        return None
    names: dict[str, str] = {}
    for item in catalog_skills:
        lab = normalize(str(item.get("label", "")))
        skill_id = item.get("id")
        if not lab or not isinstance(skill_id, str):
            raise ValueError("STRICT_LEXICAL_INVALID_PUBLIC_CATALOG")
        if lab in names and names[lab] != skill_id:
            raise ValueError("STRICT_LEXICAL_AMBIGUOUS_LABEL")
        names[lab] = skill_id
    return names.get(value)


def reorder_candidate_rankings(
    text: str, public_catalog_skills: list[dict], embedding_ranked_ids: list[str],
) -> tuple[list[str], bool]:
    """Fallback to unchanged embedding ranking when strict lexical abstains."""
    all_ids = [x["id"] for x in public_catalog_skills]
    if len(set(all_ids)) != len(all_ids) or len(embedding_ranked_ids) != len(all_ids) or set(embedding_ranked_ids) != set(all_ids):
        raise ValueError("STRICT_LEXICAL_UNPAIRED_CATALOG_RANKING")
    forced_id = strict_literal_skill_id(text, public_catalog_skills)
    if forced_id is None:
        return list(embedding_ranked_ids), False
    return [forced_id] + [x for x in embedding_ranked_ids if x != forced_id], True
