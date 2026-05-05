#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

edit_file() {
    local file_path="$1"
    local tool_name="$2"
    shift 2
    local tool_args=("$@")

    if ! command -v "$tool_name" >/dev/null 2>&1; then
        echo "$tool_name is not installed." >&2
        if [[ -t 0 && -t 1 ]]; then
            printf '\nPress Enter to close...'
            read -r _
        fi
        exit 1
    fi

    set +e
    "$tool_name" "${tool_args[@]}" "$file_path"
    local status=$?
    set -e

    exit "$status"
}

open_in_terminal() {
    local file_path="$1"
    local tool_name="$2"
    shift 2
    local tool_args=("$@")

    if command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal -- bash "$SCRIPT_PATH" --inline "$file_path" "$tool_name" "${tool_args[@]}" >/dev/null 2>&1 &
        return
    fi
    
    if command -v x-terminal-emulator >/dev/null 2>&1; then
        x-terminal-emulator -e bash "$SCRIPT_PATH" --inline "$file_path" "$tool_name" "${tool_args[@]}" >/dev/null 2>&1 &
        return
    fi
    
    if command -v xterm >/dev/null 2>&1; then
        xterm -hold -e bash "$SCRIPT_PATH" --inline "$file_path" "$tool_name" "${tool_args[@]}" >/dev/null 2>&1 &
        return
    fi

    echo "No supported terminal emulator found." >&2
    exit 1
}

main() {
    local inline_mode=0

    if [[ "${1:-}" == "--inline" ]]; then
        inline_mode=1
        shift
    fi

    if [[ $# -lt 2 ]]; then
        echo "Usage: $(basename "$0") [--inline] <path> <tool> [options...]" >&2
        exit 1
    fi

    local file_path="$1"
    local tool_name="$2"
    shift 2
    local tool_args=("$@")
    local remote_mode=0
    local filtered_args=()

    for arg in "${tool_args[@]}"; do
        case "$arg" in
            remote|--remote)
                remote_mode=1
                ;;
            *)
                filtered_args+=("$arg")
                ;;
        esac
    done

    if [[ "$inline_mode" -eq 1 ]]; then
        edit_file "$file_path" "$tool_name" "${filtered_args[@]}"
        return
    fi

    if [[ "$remote_mode" -eq 1 ]]; then
        edit_file "$file_path" "$tool_name" "${filtered_args[@]}"
        return
    fi

    open_in_terminal "$file_path" "$tool_name" "${filtered_args[@]}"
}

main "$@"