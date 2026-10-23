#!/bin/bash

# Check if the correct number of arguments is provided
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <path_to_json_input_file> <channel>"
    exit 1
fi

INPUT_JSON_FILE="$1"

CHANNEL="$2"

if [ "$CHANNEL" == "nightly" ]; then
    UPDATER="latest"
else
    UPDATER="beta"
fi

# Check if the input file exists
if [ ! -f "$INPUT_JSON_FILE" ]; then
    echo "Input file not found: $INPUT_JSON_FILE"
    exit 1
fi

# Use jq to transform the content
jq --arg channel "$CHANNEL" --arg updater "$UPDATER" '
    .productName = "Novera-\($channel)" |
    .identifier = "io.github.tronabs.novera-\($channel)" |
    .mainBinaryName = "Novera-Desktop-\($channel)"
' "$INPUT_JSON_FILE" > ./tauri.conf.json.tmp

cat ./tauri.conf.json.tmp

rm $INPUT_JSON_FILE
mv ./tauri.conf.json.tmp $INPUT_JSON_FILE

# mainBinaryName has to name a real Cargo bin target, and `default-run` has to
# name the same one, so all three move together or the manifest stops parsing.
CARGO_TOML_PATH="$(dirname "$INPUT_JSON_FILE")/Cargo.toml"
if [ -f "$CARGO_TOML_PATH" ]; then
    echo "Renaming the desktop bin target in $CARGO_TOML_PATH..."
    sed -e "s|^name = \"Novera-Desktop\"$|name = \"Novera-Desktop-${CHANNEL}\"|" \
        -e "s|^default-run = \"Novera-Desktop\"$|default-run = \"Novera-Desktop-${CHANNEL}\"|" \
        "$CARGO_TOML_PATH" > ./Cargo.toml.tmp
    mv ./Cargo.toml.tmp "$CARGO_TOML_PATH"
    grep -c "Novera-Desktop-${CHANNEL}" "$CARGO_TOML_PATH"
fi

# Update Info.plist if it exists
INFO_PLIST_PATH="./src-tauri/Info.plist"
if [ -f "$INFO_PLIST_PATH" ]; then
    echo "Updating Info.plist..."

    # Replace jan.ai.app with jan-{channel}.ai.app
    sed -i '' "s|io\.github\.tronabs\.novera|io.github.tronabs.novera-${CHANNEL}|g" "$INFO_PLIST_PATH"

    # Replace <string>novera</string> with <string>jan-{channel}</string>
    sed -i '' "s|<string>novera</string>|<string>novera-${CHANNEL}</string>|g" "$INFO_PLIST_PATH"

    echo "Info.plist updated"

    cat ./src-tauri/Info.plist
fi
# Update the layout file
# LAYOUT_FILE_PATH="web/app/layout.tsx"

# if [ ! -f "$LAYOUT_FILE_PATH" ]; then
#     echo "File does not exist: $LAYOUT_FILE_PATH"
#     exit 1
# fi

# Perform the replacements
# sed -i -e "s#Jan#Novera-$CHANNEL#g" "$LAYOUT_FILE_PATH"

# Notify completion
# echo "File has been updated: $LAYOUT_FILE_PATH"
