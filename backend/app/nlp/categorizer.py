import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

KEYWORD_TAXONOMY: dict[str, list[str]] = {
    "Food Quality": [
        "taste", "flavor", "flavour", "delicious", "bland", "stale", "cold food",
        "raw", "undercooked", "overcooked", "burnt", "fresh", "portion", "small portion",
        "big portion", "quantity", "quality", "food quality", "disgusting food",
        "bad food", "good food", "terrible food", "presentation", "spicy", "salt",
        "sweet", "sour", "bitter", "aroma", "smell bad", "smell good"
    ],
    "Service Delay": [
        "slow", "wait", "waiting", "waited", "long time", "delay", "delayed",
        "late", "took forever", "took too long", "hours", "quick", "fast service",
        "quick service", "slow service", "half an hour", "45 minutes", "forever",
        "order took", "delivery time", "table wait"
    ],
    "Staff Behavior": [
        "staff", "waiter", "waitress", "server", "rude", "impolite", "unfriendly",
        "hostile", "arrogant", "attitude", "helpful", "friendly staff", "polite",
        "courteous", "unprofessional", "professional", "attentive", "inattentive",
        "ignored", "dismissive", "manager", "chef", "team", "crew"
    ],
    "Pricing": [
        "expensive", "overpriced", "price", "pricey", "costly", "cheap", "affordable",
        "value for money", "value", "money", "worth", "not worth", "bill", "charges",
        "hidden charges", "gst", "tax", "discount", "offer", "deal", "pocket friendly"
    ],
    "Cleanliness": [
        "clean", "dirty", "hygiene", "hygienic", "unhygienic", "washroom", "toilet",
        "bathroom", "pest", "cockroach", "insect", "fly", "rat", "mouse", "dust",
        "filthy", "mess", "spill", "napkin", "sanitize", "sanitized"
    ],
    "Ambience": [
        "ambience", "ambiance", "atmosphere", "decor", "decoration", "interior",
        "music", "loud", "noisy", "quiet", "seating", "seats", "lighting", "lights",
        "cozy", "comfortable", "crowded", "spacious", "parking", "location", "view",
        "outdoor", "indoor", "vibe", "mood"
    ],
}


@dataclass
class CategoryResult:
    categories: list[str]          
    confidence: float               
    method: str                     


class ComplaintCategorizer:

    def __init__(self, use_zero_shot: bool = True, zero_shot_threshold: float = 0.35):
        self.use_zero_shot = use_zero_shot
        self.zero_shot_threshold = zero_shot_threshold
        self._zero_shot_pipeline = None

        if use_zero_shot:
            self._load_zero_shot_model()

    def _load_zero_shot_model(self) -> None:
        try:
            from transformers import pipeline
            logger.info("[Categorizer] Loading zero-shot model: facebook/bart-large-mnli")
            self._zero_shot_pipeline = pipeline(
                "zero-shot-classification",
                model="facebook/bart-large-mnli",
                device=-1,
            )
            logger.info("[Categorizer] Zero-shot model loaded")
        except Exception as e:
            logger.warning(f"[Categorizer] Zero-shot model failed to load: {e}")
            self._zero_shot_pipeline = None

    def _keyword_match(self, text: str) -> list[str]:
      
        if not text:
            return []

        text_lower = text.lower()
        matched = []

        for category, keywords in KEYWORD_TAXONOMY.items():
            for keyword in keywords:
                pattern = r"\b" + re.escape(keyword) + r"\b"
                if re.search(pattern, text_lower):
                    matched.append(category)
                    break  

        return matched

    def _zero_shot_classify(self, text: str) -> list[str]:
       
        if not self._zero_shot_pipeline:
            return []

        candidate_labels = list(KEYWORD_TAXONOMY.keys())
        hypothesis_template = "This review is about {}."

        try:
            truncated = text[:400]
            result = self._zero_shot_pipeline(
                truncated,
                candidate_labels=candidate_labels,
                hypothesis_template=hypothesis_template,
                multi_label=True,
            )
            # Filter to labels above threshold
            categories = [
                label
                for label, score in zip(result["labels"], result["scores"])
                if score >= self.zero_shot_threshold
            ]
            return categories if categories else ["Other"]
        except Exception as e:
            logger.warning(f"[Categorizer] Zero-shot error: {e}")
            return []

    def categorize(self, text: str) -> CategoryResult:
        
        if not text or not text.strip():
            return CategoryResult(["Other"], 0.0, "keyword")

        keyword_cats = self._keyword_match(text)

        if len(keyword_cats) >= 1:
            confidence = min(0.5 + 0.15 * len(keyword_cats), 1.0)
            method = "keyword"


            if self.use_zero_shot and self._zero_shot_pipeline and len(keyword_cats) < 2:
                zs_cats = self._zero_shot_classify(text)
                all_cats = list(dict.fromkeys(keyword_cats + zs_cats))
                method = "hybrid"
                return CategoryResult(all_cats, confidence, method)

            return CategoryResult(keyword_cats, confidence, method)

        if self.use_zero_shot and self._zero_shot_pipeline:
            zs_cats = self._zero_shot_classify(text)
            if zs_cats:
                return CategoryResult(zs_cats, 0.45, "zero_shot")

        return CategoryResult(["Other"], 0.2, "keyword")

    def categorize_batch(self, texts: list[str]) -> list[CategoryResult]:

        return [self.categorize(text) for text in texts]


@lru_cache(maxsize=1)
def get_categorizer() -> ComplaintCategorizer:

    from app.config import get_settings
    settings = get_settings()
    return ComplaintCategorizer(use_zero_shot=not settings.USE_GPU)
