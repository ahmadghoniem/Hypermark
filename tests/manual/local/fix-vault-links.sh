#!/bin/bash
# Adds [[Hypermark Plans]] backlink to existing plan files
#
# Usage: ./fix-vault-links.sh /path/to/vault/hypermark

FOLDER="${1:-$HOME/Documents/*/hypermark}"

# Expand glob
FOLDER=$(echo $FOLDER)

if [[ ! -d "$FOLDER" ]]; then
    echo "Folder not found: $FOLDER"
    exit 1
fi

echo "Fixing files in: $FOLDER"

COUNT=0
for FILE in "$FOLDER"/*.md; do
    # Skip if already has the link
    if grep -q '\[\[Hypermark Plans\]\]' "$FILE" 2>/dev/null; then
        continue
    fi

    # Insert [[Hypermark Plans]] after frontmatter (after second ---)
    # Using awk to find the end of frontmatter and insert
    awk '
        /^---$/ { count++ }
        { print }
        count == 2 && !inserted { print "\n[[Hypermark Plans]]"; inserted=1 }
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"

    COUNT=$((COUNT + 1))
    echo "Fixed: $(basename "$FILE")"
done

echo ""
echo "Done. Fixed $COUNT files."
