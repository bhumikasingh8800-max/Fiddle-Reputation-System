"""FastAPI router: aggregated analytics endpoints using Prisma."""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from prisma import Prisma

from app.database import get_db

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

CATEGORIES = [
    "Food Quality", "Service Delay", "Staff Behavior",
    "Pricing", "Cleanliness", "Ambience", "Other"
]


def _period_to_cutoff(period: str) -> Optional[datetime]:
    """Convert period string to datetime cutoff."""
    # Add "100d": 100 to the mapping dictionary
    mapping = {"7d": 7, "30d": 30, "90d": 90, "100d": 100}
    days = mapping.get(period)
    return datetime.utcnow() - timedelta(days=days) if days else None


@router.get("/overview", summary="Platform-wide statistics")
async def get_overview(db: Prisma = Depends(get_db)):
    """
    Returns overall platform statistics:
    total outlets, reviews, avg rating, sentiment distribution,
    and top complaint categories across ALL outlets.
    """
    total_outlets = await db.restaurant.count(where={"is_active": True})

    # Removed the 'select' argument; fetching full models
    reviews = await db.review.find_many()

    total_reviews = len(reviews)
    ratings = [r.rating for r in reviews if r.rating is not None]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None

    sentiment_counts = {}
    platform_counts = {}
    category_counts = {}

    for r in reviews:
        if r.sentiment:
            sentiment_counts[r.sentiment] = sentiment_counts.get(r.sentiment, 0) + 1
        if r.source:
            platform_counts[r.source] = platform_counts.get(r.source, 0) + 1
        for cat in (r.complaint_categories or []):
            category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "total_outlets": total_outlets,
        "total_reviews": total_reviews,
        "avg_rating": avg_rating,
        "sentiment_counts": sentiment_counts,
        "platform_counts": platform_counts,
        "category_counts": dict(
            sorted(category_counts.items(), key=lambda x: -x[1])
        ),
    }


@router.get("/{restaurant_id}", summary="Per-outlet analytics")
async def get_outlet_analytics(
    restaurant_id: uuid.UUID,
    # Update default to "100d" and add "100d" to the regex
    period: str = Query("100d", regex="^(7d|30d|90d|100d|all)$"),
    db: Prisma = Depends(get_db),
):
    """
    Returns analytics for a specific outlet within the given time period.
    Includes sentiment breakdown, category frequency, source breakdown,
    and recent rating trend.
    """
    cutoff = _period_to_cutoff(period)
    where = {"restaurant_id": str(restaurant_id)}
    if cutoff:
        where["scraped_at"] = {"gte": cutoff}

    # Removed the 'select' argument; fetching full models based on 'where' filter
    reviews = await db.review.find_many(where=where)

    ratings = [r.rating for r in reviews if r.rating is not None]
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    platform_counts = {}
    category_counts = {}

    for r in reviews:
        if r.sentiment:
            sentiment_counts[r.sentiment] = sentiment_counts.get(r.sentiment, 0) + 1
        if r.source:
            platform_counts[r.source] = platform_counts.get(r.source, 0) + 1
        for cat in (r.complaint_categories or []):
            category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "restaurant_id": str(restaurant_id),
        "period": period,
        "total_reviews": len(reviews),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "sentiment_counts": sentiment_counts,
        "platform_counts": platform_counts,
        "category_counts": dict(sorted(category_counts.items(), key=lambda x: -x[1])),
    }


@router.get("/trend/rating", summary="Time-series rating and review count trend")
async def get_rating_trend(
    restaurant_id: Optional[uuid.UUID] = Query(None),
    # Update default to "100d" and add "100d" to the regex
    period: str = Query("100d", regex="^(30d|90d|100d|all)$"),
    db: Prisma = Depends(get_db),
):
    """
    Returns weekly aggregated average rating and review count over time.
    Used to power time-series charts in the dashboard.
    """
    cutoff = _period_to_cutoff(period)
    where = {
        "review_date": {"not": None},
        "rating": {"not": None}
    }
    if restaurant_id:
        where["restaurant_id"] = str(restaurant_id)
    if cutoff:
        where["scraped_at"] = {"gte": cutoff}

    # Removed the 'select' argument; fetching full models based on 'where' filter
    reviews = await db.review.find_many(where=where)

    weekly = {}
    for r in reviews:
        review_date = r.review_date
        rating = r.rating
        if not review_date or rating is None:
            continue
        week_key = review_date.strftime("%Y-W%V")
        if week_key not in weekly:
            weekly[week_key] = []
        weekly[week_key].append(rating)

    trend = [
        {
            "week": week,
            "avg_rating": round(sum(ratings) / len(ratings), 2),
            "review_count": len(ratings),
        }
        for week, ratings in sorted(weekly.items())
    ]

    return {"trend": trend, "period": period}


@router.get("/comparison/outlets", summary="Side-by-side outlet performance")
async def get_outlet_comparison(db: Prisma = Depends(get_db)):
    """
    Returns a comparison of all active outlets:
    avg rating, review count, and sentiment breakdown per outlet.
    Used to power outlet comparison bar chart.
    """
    # The 'include' argument is fully supported in Python Prisma, so this stays untouched.
    outlets = await db.restaurant.find_many(
        where={"is_active": True},
        include={"reviews": True}
    )

    comparison = []
    for outlet in outlets:
        reviews = outlet.reviews or []
        ratings = [r.rating for r in reviews if r.rating is not None]
        avg = round(sum(ratings) / len(ratings), 2) if ratings else None

        sentiment = {"positive": 0, "neutral": 0, "negative": 0}
        for r in reviews:
            if r.sentiment:
                sentiment[r.sentiment] = sentiment.get(r.sentiment, 0) + 1

        comparison.append({
            "restaurant_id": outlet.id,
            "name": outlet.name,
            "branch_code": outlet.branch_code,
            "city": outlet.city,
            "total_reviews": len(reviews),
            "avg_rating": avg,
            "sentiment": sentiment,
        })

    return {"outlets": comparison}