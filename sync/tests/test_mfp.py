"""Tests for the MyFitnessPal day summariser.

Run with:  python sync/tests/test_mfp.py

The case that matters is servings. MyFitnessPal gives each entry two sets of
figures: the food's, which are per serving unit, and the entry's, which are what
was actually eaten. Half a jar of sauce is 45 kcal at the entry level and 90 at
the food level. Reading the wrong one silently doubles or halves intake, and
intake feeds straight into the mission total.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fitsync.mfp_http import summarise_day  # noqa: E402


def entry(kcal, protein=None, carbs=None, fat=None, unit="calories"):
    contents = {"energy": {"unit": unit, "value": kcal}}
    if protein is not None:
        contents["protein"] = protein
    if carbs is not None:
        contents["carbohydrates"] = carbs
    if fat is not None:
        contents["fat"] = fat
    # `food` deliberately carries different numbers: the summariser must ignore it.
    return {
        "nutritional_contents": contents,
        "food": {"nutritional_contents": {"energy": {"unit": "calories", "value": 9999}}},
    }


def check(name, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
    if not ok:
        print(f"        got  {got}")
        print(f"        want {want}")
    return ok


def main():
    results = []

    # Uses entry-level figures, not the food's per-unit figures.
    day = {"date": "2026-08-24", "food_entries": [entry(120), entry(45), entry(500)]}
    results.append(check("sums entry-level calories", summarise_day(day)["calories"], 665.0))

    # A day with no entries is unknown, not a zero-calorie day. The mission only
    # counts days where intake is genuinely known.
    results.append(check("no entries yields None", summarise_day({"food_entries": []}), None))
    results.append(check("missing key yields None", summarise_day({"date": "2026-08-24"}), None))

    # Macros accumulate independently, and absent ones stay absent.
    day = {"food_entries": [entry(100, protein=25, carbs=4), entry(200, protein=10, fat=8)]}
    got = summarise_day(day)
    results.append(check("protein accumulates", got["protein"], 35.0))
    results.append(check("carbs accumulate", got["carbs"], 4.0))
    results.append(check("fat accumulates", got["fat"], 8.0))
    results.append(check("absent macro omitted", "fiber" not in got, True))

    # An entry with no energy value must not be counted as zero calories.
    day = {"food_entries": [entry(300), {"nutritional_contents": {"protein": 5}}]}
    got = summarise_day(day)
    results.append(check("entry without energy ignored for calories", got["calories"], 300.0))
    results.append(check("its macros still counted", got["protein"], 5.0))

    # Kilojoules are converted rather than trusted as calories.
    day = {"food_entries": [entry(418.4, unit="kilojoules")]}
    results.append(check("kilojoules converted", round(summarise_day(day)["calories"], 1), 100.0))

    # Entries that carry only a food block, with no entry-level contents, must
    # not silently contribute the food's per-unit numbers.
    day = {"food_entries": [{"food": {"nutritional_contents": {"energy": {"unit": "calories", "value": 500}}}}]}
    results.append(check("food-level-only entry contributes nothing", summarise_day(day), None))

    print()
    passed = sum(results)
    print(f"{passed}/{len(results)} passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
