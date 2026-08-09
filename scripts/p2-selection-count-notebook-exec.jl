#!/usr/bin/env julia

# Pluto本体でP2研究Notebookを隔離コピーから全セル実行する。
# 公開Notebook runnerとは環境と公開範囲が違うため、P2依存を通常の
# validation環境へ追加せず、Notebook内の共有P2 projectをactivateする。
using Pluto

const ROOT = normpath(joinpath(@__DIR__, ".."))
const NOTEBOOK_RELATIVE = joinpath(
    "validation", "p2-likelihood", "selection-count-teaching-notebook.jl",
)
const COPY_PATHS = (
    joinpath("scripts", "p2-likelihood-contracts.jl"),
    joinpath("validation", "p2-likelihood", "Project.toml"),
    joinpath("validation", "p2-likelihood", "Manifest.toml"),
    NOTEBOOK_RELATIVE,
)
const EXPECTED_CELLS = 31
const PASS_MARKER = "P2_SELECTION_COUNT_NOTEBOOK_PASS"

tmp_root = mktempdir()
for relative_path in COPY_PATHS
    source = joinpath(ROOT, relative_path)
    target = joinpath(tmp_root, relative_path)
    mkpath(dirname(target))
    cp(source, target)
end

notebook_path = joinpath(tmp_root, NOTEBOOK_RELATIVE)
session = Pluto.ServerSession()
println("P2_NOTEBOOK_OPEN_START ", basename(notebook_path))
notebook = Pluto.SessionActions.open(session, notebook_path; run_async = false)

body(cell) = string(cell.output.body)
errored = filter(cell -> cell.errored, notebook.cells)
marker_cells = filter(cell -> occursin("notebook_marker", cell.code), notebook.cells)
marker_visible = length(marker_cells) == 1 && occursin(PASS_MARKER, body(only(marker_cells)))

println(
    "P2_NOTEBOOK_EXECUTION cells=$(length(notebook.cells)) ",
    "errored=$(length(errored)) marker_visible=$marker_visible",
)
for cell in errored
    first_line = first(split(cell.code, "\n"))
    output = body(cell)
    println("  ERRORED: ", first_line, "\n    → ", output[1:min(end, 400)])
end

verdict = length(notebook.cells) == EXPECTED_CELLS && isempty(errored) && marker_visible
println(verdict ? "P2_SELECTION_COUNT_NOTEBOOK_EXEC_PASS" :
        "P2_SELECTION_COUNT_NOTEBOOK_EXEC_FAIL")
exit(verdict ? 0 : 1)
