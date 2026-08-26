# Diary parser fixtures

`printable_diary_fixture.html` and `printable_diary_single_table_fixture.html`
mirror the two layouts MyFitnessPal's printable diary uses: separate tables per
meal with a day-total table at the end, and one combined table.

Both were used to verify that the extractor in `fitsync/mfp.py`:

- picks the **day** total (1,847 kcal) and not a per-meal subtotal (377, 418)
- ignores the "Goal" row that sits directly beneath the total
- handles thousands separators and unit suffixes in the column headers
- maps columns by header name rather than by fixed position

If MyFitnessPal changes the page and a sync starts returning wrong numbers,
save the new HTML here and re-check the extractor against it before editing.

To re-run the check, serve a fixture and evaluate `EXTRACT_JS` against it:

```bash
python -m http.server 8123 --directory sync/tests
```

then open `http://localhost:8123/printable_diary_fixture.html` and paste the
body of `EXTRACT_JS` into the browser console. It must return
`{calories: 1847, carbs: 186, fat: 63, protein: 141, ...}`.
