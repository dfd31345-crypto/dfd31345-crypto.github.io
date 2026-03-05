# How to Add/Manage CS2 Cases and Weapon Drops

## Folder Structure

Your cases need to be organized like this:

```
cases/
  1 - FreeCase/
    1 - Consumer (Gray)/
      weapon1.png
      weapon1.png.txt
      weapon2.png
      weapon2.png.txt
    2 - Industrial (Light Blue)/
      item1.png
      item1.png.txt
  2 - PremiumCase/
    1 - Consumer (Gray)/
      ...
```

## Step-by-Step Setup

### 1) Create Case Folder
- In `/site/cases/`, create a folder named like: `1 - FreeCase` or `2 - PremiumCase`
- The **number at the front determines the order** they appear on the website

### 2) Create Rarity Subfolders
Inside your case folder, create folders for each rarity:
- `1 - Consumer (Gray)`
- `2 - Industrial (Light Blue)`
- `3 - Mil-Spec (Blue)`
- `4 - Restricted (Purple)`
- `5 - Classified (Pink)`
- `6 - Covert (Red)`
- `7 - Souvenir (Gold)`

(Only create the rarities your case has weapons for.)

### 3) Add Weapon Images + Drop Percentages

For each weapon:
1. Add the image file: `weapon.png`
2. Create a text file next to it: `weapon.png.txt`
3. Inside the `.txt` file, put just the drop percentage (e.g., `15.5`)

**Example:**
```
cases/1 - FreeCase/1 - Consumer (Gray)/
  AK47-Dragon.png
  AK47-Dragon.png.txt  (contains: 25.3)
  USP-Gold.png
  USP-Gold.png.txt     (contains: 18.7)
```

## Updating the Website

After adding/editing cases, run this command in the `site/` folder:

```bash
python3 build-cases.py
```

This scans the folder structure and generates `cases-config.json`. The website automatically loads it.

## Testing Locally

```bash
cd "/home/vboxuser/Desktop/server and site/site"
python3 -m http.server 8000
```

Open http://localhost:8000 and click a case to see the weapons and drop percentages.

## Publishing Changes

```bash
cd "/home/vboxuser/Desktop/server and site/site"
git add .
git commit -m "Added new cases and weapons"
git push
```

Your site updates automatically at shipzibi.com within minutes!

## Tips

- **Weapon image names don't matter** — only the percentage `.txt` files count
- **Drop percentages don't need to add to 100%** — display them as-is
- **Number prefixes matter for ordering:**
  - Case order: `1 - Case`, `2 - Case`, `3 - Case`
  - Rarity order: `1 - Consumer`, `2 - Industrial`, etc.
- Run `python3 build-cases.py` every time you add/remove cases or weapons
- Images auto-resize to fit the grid

## Troubleshooting

**Images not showing?**
- Check folder names match exactly (spaces, hyphens, case sensitivity)
- Run `python3 build-cases.py` after adding files

**Website shows "Error: cases-config.json not found"?**
- Open a terminal in the `site/` folder
- Run `python3 build-cases.py`
- Refresh your browser

**Drop percentages not appearing?**
- Make sure the `.txt` file is next to the image
- Check the `.txt` file contains only a number (e.g., `25.5`)

