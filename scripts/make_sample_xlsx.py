"""Generate sample_data/influencers_sample.xlsx with mixed/messy headers.

Demonstrates the auto-matcher across all three statuses:
- clean Thai/English headers that map automatically (matched)
- a fuzzy header that needs a quick check (review)
- an "Internal Ref" column that has no system field (unmapped)

Fees use the Baht (THB) scale and the agency fee is a percentage.
Run:  python scripts/make_sample_xlsx.py
"""
import os
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

rows = [
    {"Creator Name": "Luca Moretti", "@username": "@lucaeats", "Genre": "Food",
     "Social Platform": "Instagram", "อายุ": 30, "Audience": "540K", "Eng Rate": "6.1%",
     "ราคาค่าตัว": "85,000", "ค่าเจนโค๊ด": 10000, "ค่าเมเนจฟี": 15000, "ค่าเอเจนฟี %": 14,
     "Instagram Link": "https://instagram.com/lucaeats", "YouTube": "",
     "About": "Italian home cooking & restaurant reviews", "City": "Rome IT",
     "Is Verified": "yes", "Internal Ref": "LM-0091"},
    {"Creator Name": "Zara Ahmed", "@username": "@zarabeauty", "Genre": "Beauty",
     "Social Platform": "TikTok", "อายุ": 23, "Audience": "1.3M", "Eng Rate": "7.8%",
     "ราคาค่าตัว": "130,000", "ค่าเจนโค๊ด": 15000, "ค่าเมเนจฟี": 22000, "ค่าเอเจนฟี %": 18,
     "Instagram Link": "https://instagram.com/zarabeauty",
     "YouTube": "https://youtube.com/@zarabeauty",
     "About": "Affordable makeup tutorials and GRWM", "City": "Dubai AE",
     "Is Verified": "yes", "Internal Ref": "ZA-0144"},
    {"Creator Name": "Ben Carter", "@username": "@bengaming", "Genre": "Gaming",
     "Social Platform": "YouTube", "อายุ": 26, "Audience": "2.0M", "Eng Rate": "4.5%",
     "ราคาค่าตัว": "200,000", "ค่าเจนโค๊ด": 20000, "ค่าเมเนจฟี": 30000, "ค่าเอเจนฟี %": 20,
     "Instagram Link": "", "YouTube": "https://youtube.com/@bengaming",
     "About": "Let's plays and esports commentary", "City": "Austin US",
     "Is Verified": "no", "Internal Ref": "BC-0210"},
]

df = pd.DataFrame(rows)
out = os.path.join(ROOT, "sample_data", "influencers_sample.xlsx")
df.to_excel(out, index=False)
print("Wrote", out)
