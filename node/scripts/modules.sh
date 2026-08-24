#!/bin/bash

CONFIG_FILE="./config/modules.config.js"

sort_modules() {
  local temp_file core_file lite_file

  temp_file=$(mktemp "${CONFIG_FILE}.tmp.XXXXXX") || return 1
  core_file=$(mktemp "${CONFIG_FILE}.core.XXXXXX") || {
    rm -f "$temp_file"
    return 1
  }
  lite_file=$(mktemp "${CONFIG_FILE}.lite.XXXXXX") || {
    rm -f "$temp_file" "$core_file"
    return 1
  }

  if ! awk -v core_file="$core_file" -v lite_file="$lite_file" '
    function is_module(line, value) {
      value = line
      sub(/^[[:space:]]*/, "", value)
      sub(/^\/\/[[:space:]]*/, "", value)
      return value ~ /^["\047][^"\047]+["\047][[:space:]]*,?[[:space:]]*$/
    }

    function module_path(line, value) {
      value = line
      sub(/^[[:space:]]*/, "", value)
      sub(/^\/\/[[:space:]]*/, "", value)
      sub(/^["\047]/, "", value)
      sub(/["\047][[:space:]]*,?[[:space:]]*$/, "", value)
      return value
    }

    function normalized_module(line, path, value, indentation, disabled) {
      path = module_path(line)
      value = line
      sub(/^[[:space:]]*/, "", value)
      disabled = value ~ /^\/\//
      match(line, /[^[:space:]]/)
      indentation = substr(line, 1, RSTART - 1)
      return tolower(path) "\t" disabled "\t" indentation (disabled ? "//" : "") "\047" path "\047,"
    }

    function print_sorted(    command, line, module, previous_module) {
      close(section_file)
      command = "LC_ALL=C sort -s -t \"\t\" -k1,1 -k2,2n " section_file
      while ((command | getline line) > 0) {
        module = line
        sub(/\t.*/, "", module)
        if (module == previous_module) {
          continue
        }
        previous_module = module
        sub(/^[^\t]*\t[^\t]*\t/, "", line)
        print line
      }
      if (close(command) != 0) {
        print "Unable to sort " section " section" > "/dev/stderr"
        failed = 1
        exit 1
      }
    }

    /^[[:space:]]*core:[[:space:]]*\[/ {
      if (section != "") {
        print "Nested module section near line " NR > "/dev/stderr"
        failed = 1
        exit 1
      }
      section = "core"
      section_file = core_file
      found_core = 1
      print
      next
    }

    /^[[:space:]]*lite:[[:space:]]*\[/ {
      if (section != "") {
        print "Nested module section near line " NR > "/dev/stderr"
        failed = 1
        exit 1
      }
      section = "lite"
      section_file = lite_file
      found_lite = 1
      print
      next
    }

    section != "" && /^[[:space:]]*\],[[:space:]]*$/ {
      print_sorted()
      print
      section = ""
      next
    }

    section != "" {
      if (!is_module($0)) {
        print "Unexpected content in " section " section near line " NR > "/dev/stderr"
        failed = 1
        exit 1
      }

      print normalized_module($0) > section_file
      next
    }

    { print }

    END {
      if (!failed && section != "") {
        print "Unterminated " section " section" > "/dev/stderr"
        failed = 1
      }
      if (!failed && (!found_core || !found_lite)) {
        print "Both core and lite sections are required" > "/dev/stderr"
        failed = 1
      }
      if (failed) {
        exit 1
      }
    }
  ' "$CONFIG_FILE" > "$temp_file"; then
    rm -f "$temp_file" "$core_file" "$lite_file"
    return 1
  fi

  rm -f "$core_file" "$lite_file"
  if ! chmod --reference="$CONFIG_FILE" "$temp_file" || ! mv "$temp_file" "$CONFIG_FILE"; then
    rm -f "$temp_file"
    return 1
  fi
  echo "Modules sorted: core and lite"
}

add_module() {
  local module="$1"
  local module_js="$module/$module.js"

  # Add to "core" section
  if grep -q "core: \[" "$CONFIG_FILE"; then
    sed -i "/core: \[/a\    '$module_js'," "$CONFIG_FILE"
    echo "Module added to core: $module"
  else
    echo "No core section found."
  fi

  # Add to "lite" section
  if grep -q "lite: \[" "$CONFIG_FILE"; then
    sed -i "/lite: \[/a\    '$module_js'," "$CONFIG_FILE"
    echo "Module added to lite: $module"
  else
    echo "No lite section found."
  fi

  # Remove any trailing commas before the closing brackets for both core and lite sections
  sed -i '/core: \[/,/]/s/,\s*]/ ]/' "$CONFIG_FILE"
  sed -i '/lite: \[/,/]/s/,\s*]/ ]/' "$CONFIG_FILE"
}


remove_module() {
  local module="$1"
  local module_js="$module/$module.js"

  if grep -q "$module_js" "$CONFIG_FILE"; then
    sed -i "\|$module_js|d" "$CONFIG_FILE"
    echo "Module removed: $module"
  else
    echo "No match found for module: $module"
  fi
}


enable_module() {
  local module="$1"
  local module_js="$module/$module.js"

  if grep -Eq "^[[:space:]]*//[[:space:]]*['\"]$module_js['\"]" "$CONFIG_FILE"; then
    sed -i -E "s|^([[:space:]]*)//[[:space:]]*['\"]$module_js['\"]|\1'$module_js'|g" "$CONFIG_FILE"
    echo "Module enabled: $module"
  elif grep -Eq "^[[:space:]]*['\"]$module_js['\"]" "$CONFIG_FILE"; then
    echo "Module already enabled: $module"
  else
    echo "No match found for module: $module"
  fi
}

disable_module() {
  local module="$1"
  local module_js="$module/$module.js"

  if grep -Eq "^[[:space:]]*['\"]$module_js['\"]" "$CONFIG_FILE"; then
    sed -i -E "s|^([[:space:]]*)['\"]$module_js['\"]|\1//'$module_js'|g" "$CONFIG_FILE"
    echo "Module disabled: $module"
  elif grep -Eq "^[[:space:]]*//[[:space:]]*['\"]$module_js['\"]" "$CONFIG_FILE"; then
    echo "Module already disabled: $module"
  else
    echo "No match found for module: $module"
  fi
}

sort_requested=false
arguments=()

for argument in "$@"; do
  if [ "$argument" = "--sort" ]; then
    sort_requested=true
  else
    arguments+=("$argument")
  fi
done

command="${arguments[0]:-}"
module="${arguments[1]:-}"
status=0

if [ "${#arguments[@]}" -gt 2 ] || { [ -n "$command" ] && [ -z "$module" ]; }; then
  status=1
fi

case "$command" in
  add|remove|enable|disable|"")
    ;;
  *)
    status=1
    ;;
esac

if [ -z "$command" ] && [ "$sort_requested" != true ]; then
  status=1
fi

if [ "$status" -ne 0 ]; then
  echo "Usage: $0 [--sort] {add|remove|enable|disable} <module_name>"
  echo "       $0 --sort"
  exit "$status"
fi

case "$command" in
  add)
    add_module "$module"
    ;;
  remove)
    remove_module "$module"
    ;;
  enable)
    enable_module "$module"
    ;;
  disable)
    disable_module "$module"
    ;;
  "")
    ;;
esac

if [ "$sort_requested" = true ]; then
  sort_modules
fi
