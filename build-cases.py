#!/usr/bin/env python3
"""
build-cases.py — Auto-scan the cases/ folder structure and generate cases-config.json

Usage:
    python3 build-cases.py

This script:
1. Looks for image files in cases/ folder (preview images like "1 - FreeCase.png")
2. Looks for subfolders with rarity folders containing weapon images
3. Generates cases-config.json for the website to read

Folder structure expected:
cases/
  1 - FreeCase.png (preview image - optional)
  1 - FreeCase/ (weapons folder - optional)
    1 - Consumer (Gray)/
      weapon1.png
      weapon1.png.txt (contains percentage)
"""

import os
import json
from pathlib import Path

CASES_DIR = "cases"
OUTPUT_FILE = "cases-config.json"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}

def get_percentage(image_path):
    """Read percentage from a .txt file next to the image."""
    txt_file = f"{image_path}.txt"
    if os.path.exists(txt_file):
        try:
            with open(txt_file, 'r') as f:
                return float(f.read().strip())
        except ValueError:
            return 0.0
    return 0.0

def extract_case_id(filename):
    """Extract case ID from filename (e.g., '1 - FreeCase.png' -> '1 - FreeCase')."""
    return Path(filename).stem

def build_cases_config():
    """Scan directory and build config."""
    if not os.path.isdir(CASES_DIR):
        print(f"Error: {CASES_DIR}/ folder not found.")
        return

    cases = {}

    # First, detect preview images (e.g., "1 - FreeCase.png")
    image_files = [f for f in os.listdir(CASES_DIR) 
                   if os.path.isfile(os.path.join(CASES_DIR, f)) 
                   and Path(f).suffix.lower() in IMAGE_EXTENSIONS]

    for img_file in sorted(image_files):
        case_id = extract_case_id(img_file)
        if case_id not in cases:
            cases[case_id] = {
                "id": case_id,
                "name": case_id.split(" - ", 1)[1] if " - " in case_id else case_id,
                "preview": f"cases/{img_file}",
                "rarities": []
            }

    # Then, detect weapon folders and their rarities
    case_folders = sorted([d for d in os.listdir(CASES_DIR) 
                          if os.path.isdir(os.path.join(CASES_DIR, d))])

    for case_folder in case_folders:
        case_path = os.path.join(CASES_DIR, case_folder)
        rarity_folders = sorted([d for d in os.listdir(case_path) 
                                if os.path.isdir(os.path.join(case_path, d))])

        if case_folder not in cases:
            cases[case_folder] = {
                "id": case_folder,
                "name": case_folder.split(" - ", 1)[1] if " - " in case_folder else case_folder,
                "preview": None,
                "rarities": []
            }

        for rarity_folder in rarity_folders:
            rarity_path = os.path.join(case_path, rarity_folder)
            weapons = []

            # Find all image files and their percentages
            image_files = [f for f in os.listdir(rarity_path) 
                          if os.path.isfile(os.path.join(rarity_path, f)) 
                          and Path(f).suffix.lower() in IMAGE_EXTENSIONS]
            image_files.sort()

            for image_file in image_files:
                image_full_path = os.path.join(rarity_path, image_file)
                percentage = get_percentage(image_full_path)
                weapons.append({
                    "image": image_file,
                    "chance": percentage
                })

            if weapons:
                cases[case_folder]["rarities"].append({
                    "name": rarity_folder,
                    "weapons": weapons
                })

    # Convert to list and sort by ID
    cases_list = sorted(cases.values(), key=lambda x: x["id"])

    # Write to JSON
    output = {"cases": cases_list}
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"✓ Generated {OUTPUT_FILE}")
    print(f"  Found {len(cases_list)} case(s)")
    for case in cases_list:
        total_weapons = sum(len(r["weapons"]) for r in case["rarities"])
        preview_status = "✓ preview" if case.get("preview") else "✗ no preview"
        print(f"    - {case['id']}: {preview_status}, {len(case['rarities'])} rarity/rarities, {total_weapons} weapon(s)")

if __name__ == "__main__":
    build_cases_config()

