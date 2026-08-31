#!/bin/bash
# macOS one-click launcher. Double-click this in Finder; it opens Terminal and
# runs start-visualizer.sh (which holds all the logic).
exec "$(cd "$(dirname "$0")" && pwd)/start-visualizer.sh"
