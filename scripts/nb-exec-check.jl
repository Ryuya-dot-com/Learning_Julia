# Pluto 本体でノートブックをフル実行する検証。
# 1) 未着手状態で全セル実行 → エラー0・判定セルが全て⏳ であること
# 2) ANSWERS指定時だけ、模範解答を差し込み再実行 → エラー0・判定セルが全て✅
#
# 使い方:
#   CI smoke: julia --project=validation scripts/nb-exec-check.jl public/notebooks/nbX-*.jl
#   完全検証: julia --project=validation scripts/nb-exec-check.jl NOTEBOOK ANSWERS
# answers ファイルは ANSWERS::Vector{Pair{String,String}}(TODO行の検索パターン => 模範解答)と
# EXPECT_JUDGE::Int(判定セル数)を定義する。docs/nb-answers/ は gitignore 対象(模範解答を公開しない)。
using Pluto

const EXPECTED_JUDGES = Dict(
    "nb1-data.jl" => 5,
    "nb2-stats.jl" => 6,
    "nb3-sim.jl" => 5,
    "nb4-model.jl" => 14,
    "nb5-advanced.jl" => 9,
)

length(ARGS) in (1, 2) || error("usage: nb-exec-check.jl NOTEBOOK [ANSWERS]")
# include は呼び出し元ではなく、このスクリプトの場所を基準に相対パスを
# 解決するため、CLI引数は先に作業ディレクトリ基準の絶対パスへ変換する。
path = abspath(ARGS[1])
has_answers = length(ARGS) == 2
expected_judge = get(EXPECTED_JUDGES, basename(path), nothing)
isnothing(expected_judge) && error("No judge-count contract for $(basename(path))")
if has_answers
    answers_file = abspath(ARGS[2])
    include(answers_file)   # ANSWERS::Vector{Pair{String,String}}, EXPECT_JUDGE::Int
    EXPECT_JUDGE == expected_judge || error("Answer contract disagrees with public notebook contract")
end

tmpdir = mktempdir()
tmp = joinpath(tmpdir, basename(path))
cp(path, tmp)

# リポジトリ内のNotebookは public/notebooks/、配布データは public/data/ にある。
# 検証用コピーにもCSVを添え、ネットワークfallbackへ流れずオフラインで再現する。
data_dir = normpath(joinpath(dirname(path), "..", "data"))
if isdir(data_dir)
    for name in filter(name -> endswith(lowercase(name), ".csv"), readdir(data_dir))
        cp(joinpath(data_dir, name), joinpath(tmpdir, name))
    end
end

session = Pluto.ServerSession()
println("OPEN_START ", basename(path))
nb = Pluto.SessionActions.open(session, tmp; run_async = false)

body(c) = string(c.output.body)
# 判定セル = 行頭の「if <変数> === missing」で分岐するセル。通常の計算式にも
# `=== missing` が現れるため、単なる部分文字列一致では誤警告になる。
isjudge(c) = occursin(r"(?m)^\s*if\s+[^\n]*===\s*missing", c.code)
judges = [c for c in nb.cells if isjudge(c)]
errored = [c for c in nb.cells if c.errored]
println("PHASE1 cells=", length(nb.cells), " judge=", length(judges), " errored=", length(errored))
for c in errored
    println("  ERRORED: ", first(split(c.code, "\n")), "\n    → ", body(c)[1:min(end, 300)])
end
n_wait = count(c -> occursin("⏳", body(c)), judges)
println("PHASE1 ⏳=", n_wait, " (期待 ", expected_judge, ")")

verdict = length(judges) == expected_judge &&
          length(errored) == 0 && n_wait == expected_judge

if has_answers
    # --- 模範解答の差し込み ---
    changed = Pluto.Cell[]
    for (pat, code) in ANSWERS
        i = findfirst(c -> occursin(pat, c.code), nb.cells)
        if i === nothing
            println("ANSWER_TARGET_NOT_FOUND: ", pat)
            continue
        end
        nb.cells[i].code = code
        push!(changed, nb.cells[i])
    end
    Pluto.update_run!(session, nb, changed)

    errored2 = [c for c in nb.cells if c.errored]
    println("PHASE2 errored=", length(errored2))
    for c in errored2
        println("  ERRORED: ", first(split(c.code, "\n")), "\n    → ", body(c)[1:min(end, 300)])
    end
    n_ok = count(c -> occursin("✅", body(c)), judges)
    println("PHASE2 ✅=", n_ok, " (期待 ", expected_judge, ")")
    for c in judges
        occursin("✅", body(c)) || println("  NOT_OK: ", first(split(c.code, "\n")), " → ", body(c)[1:min(end, 160)])
    end
    verdict &= length(changed) == length(ANSWERS) &&
               length(errored2) == 0 && n_ok == expected_judge
end

phase = has_answers ? "initial+answers" : "initial"
println(verdict ? "EXEC_CHECK_PASS phase=$phase" : "EXEC_CHECK_FAIL phase=$phase")
exit(verdict ? 0 : 1)
