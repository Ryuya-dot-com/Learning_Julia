### A Pluto.jl notebook ###
# v1.0.3

using Markdown
using InteractiveUtils

# ╔═╡ 6b1d0101-0000-11f1-9a01-000000000001
begin
    using DelimitedFiles
    using SHA
end

# ╔═╡ 6b1d0102-0000-11f1-9a01-000000000002
md"""
# NB6: R・Stan連携の演習ノート

Julia、R、Stanを一つの解析で使うときの**受け渡し境界**を作ります。外部ソフトがなくても、CSV、実行command、Stan model、実行記録の課題には取り組めます。Rscriptが見つかる環境では、小さな集計をRへ渡してJuliaへ読み戻せます。

先にWeb教材の「R・Stanへ渡すデータの契約」から順に読むことを勧めます。StanのcompileとsamplingにはCmdStanとC++ toolchainが必要なため、このノートの必須課題にはしません。

`# TODO` のセルを書きかえ、下の判定セルを確認してください。外部programへ渡すのは、このノートが一時directoryに作る固定fixtureだけです。
"""

# ╔═╡ 6b1d0103-0000-11f1-9a01-000000000003
md"""
## 課題1: CSVを別の読込処理へ渡す

列名を含む小さな表 `bridge_table` を、`bridge_dir` 内の `trials.csv` へ書き出します。`writedlm(path, table, ',')` を使い、作成したpathを `exchange_path` に入れましょう。

判定セルは `readdlm` で読み戻し、3列・4行と列名を確認します。実際の研究ではCSV.jlで型を指定し、schema、主key、欠損、水準も検査してください。
"""

# ╔═╡ 6b1d0104-0000-11f1-9a01-000000000004
begin
    bridge_dir = mktempdir()
    bridge_table = Any[
        "participant_id" "condition" "rt_ms";
        "P01" "control" 510.0;
        "P01" "treatment" 472.0;
        "P02" "control" 604.0;
        "P02" "treatment" 551.0;
    ]
end

# ╔═╡ 6b1d0105-0000-11f1-9a01-000000000005
exchange_path = missing # TODO: (path = joinpath(bridge_dir, "trials.csv"); writedlm(path, bridge_table, ','); path)

# ╔═╡ 6b1d0106-0000-11f1-9a01-000000000006
if exchange_path === missing
    md"⏳ `bridge_dir` 内へ `bridge_table` をカンマ区切りで書き、pathを返します。"
elseif exchange_path isa AbstractString
    let restored_csv = try
            let csv_text = isfile(exchange_path) ? read(exchange_path, String) : ""
                isempty(strip(csv_text)) ? nothing : readdlm(IOBuffer(csv_text), ',', header = true)
            end
        catch err
            # ponytail: 引用符エラーだけ文面で識別する。専用例外が提供されたら型判定へ移す。
            quote_error = err isa ErrorException &&
                (startswith(err.msg, "truncated column at row ") ||
                 startswith(err.msg, "unexpected character '"))
            quote_error || err isa Union{ArgumentError, SystemError, Base.IOError, EOFError} || rethrow()
            nothing
        end
        if restored_csv !== nothing && size(restored_csv[1]) == (4, 3) &&
           isequal(vec(restored_csv[2]), ["participant_id", "condition", "rt_ms"])
            md"✅ **正解!** 3列・4行と列名を、別の読込処理で確認できました。"
        else
            md"🤔 CSVを読み戻せるか、列名と4行×3列の形が合っているかを確認してください。"
        end
    end
else
    md"🤔 `exchange_path`には、実際に作成したCSVのpathを入れます。"
end

# ╔═╡ 6b1d0107-0000-11f1-9a01-000000000007
md"""
## 課題2: Rscriptの実行commandを組み立てる

次のセルは、入力CSVをRで読み、条件別平均を `r-summary.csv` へ書くscriptを用意します。解析本体ではscriptをrepositoryに保存しますが、ここでは一時fileだけを使います。

`Cmd([r_executable, "--vanilla", r_script_path, exchange_path, r_output_path])` を `r_runner` に入れましょう。`--vanilla` は、利用者ごとの保存workspaceやstartup fileへ依存しないための指定です。まだ実行はしません。
"""

# ╔═╡ 6b1d0108-0000-11f1-9a01-000000000008
begin
    r_script_path = joinpath(bridge_dir, "summarize.R")
    r_output_path = joinpath(bridge_dir, "r-summary.csv")
    write(r_script_path, """
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) stop("expected input and output paths")
d <- read.csv(args[[1]], stringsAsFactors = FALSE, check.names = FALSE)
required <- c("participant_id", "condition", "rt_ms")
if (!identical(names(d), required)) stop("schema mismatch")
if (anyNA(d[required])) stop("missing values are not allowed")
summary <- aggregate(rt_ms ~ condition, data = d, FUN = mean)
names(summary)[[2]] <- "mean_rt"
write.csv(summary, args[[2]], row.names = FALSE)
""")
    r_executable = something(Sys.which("Rscript"), "Rscript")
end

# ╔═╡ 6b1d0109-0000-11f1-9a01-000000000009
r_runner = missing # TODO: Cmd([r_executable, "--vanilla", r_script_path, exchange_path, r_output_path])

# ╔═╡ 6b1d0110-0000-11f1-9a01-000000000010
if r_runner === missing
    md"⏳ 実行file、`--vanilla`、R script、入力、出力の順に持つ `Cmd` を作ります。"
elseif r_runner isa Cmd && length(r_runner.exec) == 5 &&
       basename(r_runner.exec[1]) in ("Rscript", "Rscript.exe") &&
       r_runner.exec[2] == "--vanilla" &&
       isequal(r_runner.exec[3:5], [r_script_path, exchange_path, r_output_path])
    md"✅ **正解!** 実行するR scriptと入出力pathが明示されたcommandです。"
else
    md"🤔 `Cmd([実行file, \"--vanilla\", R script, 入力CSV, 出力CSV])` の順序を確認してください。"
end

# ╔═╡ 6b1d0111-0000-11f1-9a01-000000000011
md"""
## 課題3: Rがあれば実行し、なければ状態を残す

`Sys.which("Rscript")` が `nothing` なら `:unavailable` を返します。見つかった場合だけ `run(r_runner)` を実行し、出力を `readdlm(..., header = true)` で読み戻して、次のNamedTupleを `r_result` に入れましょう。

```julia
(rows = 行数,
 header = String.(vec(列名)),
 values = Float64.(平均値列))
```

外部環境がないことを失敗した数値で埋めず、明示した状態として扱います。
"""

# ╔═╡ 6b1d0112-0000-11f1-9a01-000000000012
r_result = missing # TODO: if isnothing(Sys.which("Rscript")); :unavailable; else; run(r_runner); table, header = readdlm(r_output_path, ',', header = true); (rows = size(table, 1), header = String.(vec(header)), values = Float64.(table[:, 2])); end

# ╔═╡ 6b1d0113-0000-11f1-9a01-000000000013
if r_result === missing
    md"⏳ Rscriptの有無を確認し、`:unavailable`または読戻した要約を返します。"
elseif r_result === :unavailable && isnothing(Sys.which("Rscript"))
    md"✅ **環境確認完了。** Rscriptは見つかりません。課題4へ進めます。実行するときはRを導入し、新しいJulia sessionで再確認してください。"
elseif r_result isa NamedTuple &&
       all(k -> hasproperty(r_result, k), (:rows, :header, :values)) &&
       r_result.rows isa Integer && !(r_result.rows isa Bool) && r_result.rows == 2 &&
       isequal(r_result.header, ["condition", "mean_rt"]) &&
       r_result.values isa AbstractVector && length(r_result.values) == 2 &&
       all(x -> x isa Real && !(x isa Bool) && isfinite(x), r_result.values) &&
       isapprox(sort(r_result.values), [511.5, 557.0]; atol = 1e-10)
    md"✅ **正解!** Julia → CSV → R → CSV → Juliaの一往復が通り、条件別平均も照合できました。"
else
    md"🤔 Rがある場合は終了状態を確認してから出力を読み、2行、列名、平均511.5と557.0を照合します。"
end

# ╔═╡ 6b1d0114-0000-11f1-9a01-000000000014
md"""
## 課題4: Stanの入力契約を作る

`stan_model` のdata blockに合わせて、`model`、`data`、`seed`、`chains`を持つNamedTuple `stan_run` を作ります。

- `data` は `Dict("N" => length(stan_y), "y" => stan_y)`
- `seed` は `20260904`
- `chains` は `4`

ここではcompileしません。CmdStanのある環境では、この契約をStanSampleの `SampleModel` と `stan_sample` へ渡します。
"""

# ╔═╡ 6b1d0115-0000-11f1-9a01-000000000015
begin
    stan_model = raw"""
data {
  int<lower=0> N;
  array[N] int<lower=0, upper=1> y;
}
parameters {
  real<lower=0, upper=1> theta;
}
model {
  theta ~ beta(1, 1);
  y ~ bernoulli(theta);
}
generated quantities {
  int y_rep = bernoulli_rng(theta);
}
"""
    stan_y = [0, 1, 0, 1, 0, 0, 0, 0, 0, 1]
end

# ╔═╡ 6b1d0116-0000-11f1-9a01-000000000016
stan_run = missing # TODO: (model = stan_model, data = Dict("N" => length(stan_y), "y" => stan_y), seed = 20260904, chains = 4)

# ╔═╡ 6b1d0117-0000-11f1-9a01-000000000017
if stan_run === missing
    md"⏳ model、data、seed、chainsを一つのNamedTupleにまとめます。"
elseif stan_run isa NamedTuple && hasproperty(stan_run, :model) &&
       hasproperty(stan_run, :data) && hasproperty(stan_run, :seed) &&
       hasproperty(stan_run, :chains) &&
       stan_run.model isa AbstractString && stan_run.model == stan_model &&
       stan_run.data isa AbstractDict && all(k -> haskey(stan_run.data, k), ("N", "y")) &&
       stan_run.data["N"] isa Integer && !(stan_run.data["N"] isa Bool) && stan_run.data["N"] == 10 &&
       stan_run.data["y"] isa AbstractVector &&
       all(x -> x isa Integer && !(x isa Bool), stan_run.data["y"]) &&
       isequal(stan_run.data["y"], stan_y) &&
       stan_run.seed isa Integer && !(stan_run.seed isa Bool) && stan_run.seed == 20260904 &&
       stan_run.chains isa Integer && !(stan_run.chains isa Bool) && stan_run.chains == 4
    md"✅ **正解!** Stanのmodel、入力data、seed、chain数を一つの実行契約にできました。"
else
    md"🤔 data blockと同じ名前 `N`・`y`を使い、seedと4 chainsを明示してください。"
end

# ╔═╡ 6b1d0118-0000-11f1-9a01-000000000018
md"""
## 課題5: 入力とmodelのhashを実行記録へ入れる

入力CSVのbyte列と `stan_model` のSHA-256を計算し、`input_sha256`、`model_sha256`、`julia_version`、`rscript`を持つNamedTuple `bridge_manifest` を作ります。判定セルは入力・modelからhashを計算し直し、実行環境の記録も照合します。

Rscriptがなければ、`rscript`には`"not found"`を入れます。hashは内容の妥当性を証明するものではなく、再実行時に同じ入力・modelか照合する識別子です。外部ファイルを書き換えたときは、この判定セルも再実行してください。
"""

# ╔═╡ 6b1d0119-0000-11f1-9a01-000000000019
bridge_manifest = missing # TODO: (input_sha256 = bytes2hex(sha256(read(exchange_path))), model_sha256 = bytes2hex(sha256(stan_model)), julia_version = string(VERSION), rscript = something(Sys.which("Rscript"), "not found"))

# ╔═╡ 6b1d0120-0000-11f1-9a01-000000000020
if bridge_manifest === missing
    md"⏳ `bytes2hex(sha256(...))`で入力とmodelのhashを作り、版・実行fileとまとめます。"
elseif exchange_path === missing
    md"⏳ 先に課題1の入力CSVを作成してください。"
elseif bridge_manifest isa NamedTuple &&
       all(k -> hasproperty(bridge_manifest, k) && getproperty(bridge_manifest, k) isa AbstractString,
           (:input_sha256, :model_sha256, :julia_version, :rscript)) &&
       bridge_manifest.model_sha256 == bytes2hex(sha256(stan_model)) &&
       bridge_manifest.julia_version == string(VERSION) &&
       bridge_manifest.rscript == something(Sys.which("Rscript"), "not found")
    let input_hash = try
            exchange_path isa AbstractString && isfile(exchange_path) ?
                bytes2hex(sha256(read(exchange_path))) : nothing
        catch err
            err isa Union{ArgumentError, SystemError, Base.IOError, EOFError} || rethrow()
            nothing
        end
        if isequal(bridge_manifest.input_sha256, input_hash)
            md"✅ **正解!** 入力・modelのhashと実行環境の記録が一致しました。"
        else
            md"🤔 入力CSVを読めるか、記録した後に内容が変わっていないかを確認してください。"
        end
    end
else
    md"🤔 二つのhashを元の内容から計算し、Julia版とRscriptの場所も現在の環境に合わせてください。64文字にするだけでは一致しません。"
end

# ╔═╡ 6b1d0121-0000-11f1-9a01-000000000021
md"""
## 実環境へ進むときの最小例

### JuliaからRCallを使う

```julia
using RCall
rt_ms = [510.0, 520.0, 470.0, 480.0]
condition = ["control", "control", "treatment", "treatment"]
@rput rt_ms condition
R\"condition <- factor(condition, levels = c('control', 'treatment'))\"
R\"fit <- lm(rt_ms ~ condition)\"
coef_values = rcopy(R\"unname(coef(fit))\")
```

### RからJuliaCallを使う

```r
library(JuliaCall)
julia <- julia_setup()
julia_command("range_summary(x) = (minimum = minimum(x), maximum = maximum(x))")
julia_call("range_summary", c(4, 8, 15, 16, 23, 42))
```

### JuliaからStanSampleを使う

```julia
using StanSample
sm = SampleModel("bernoulli_bridge", stan_run.model)
rc = stan_sample(sm; data = stan_run.data,
                 seed = stan_run.seed, num_chains = stan_run.chains)
success(rc) || error("Stan sampling failed")
draws = read_samples(sm, :dataframe)
```

実行後は成功状態だけでなく、R̂、bulk／tail ESS、MCSE、divergence、treedepth、事後予測を確認し、chain別の生draws CSVも保存します。
"""

# ╔═╡ 6b1d0122-0000-11f1-9a01-000000000022
md"""
## おつかれさまでした

5課題を通して、外部engineを使う前後の境界を作りました。

1. schemaを決めたCSVを作り、別の処理で読み戻す
2. Rscript、入力、出力を明示したcommandを作る
3. 外部環境の有無を状態として扱う
4. Stanのmodel・data・seed・chain数を一組にする
5. 入力とmodelのhash、実行環境を記録する

研究へ移すときは、RCall・JuliaCall・StanSampleのどれか必要な方向だけを選びます。同じ処理を三つの言語へ重複させる必要はありません。
"""

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
DelimitedFiles = "8bb1440f-4735-579b-a4ab-409b98df4dab"
SHA = "ea8e919c-243c-51af-8825-aaa63cd721ce"

[compat]
julia = "1.12"
"""

# ╔═╡ 00000000-0000-0000-0000-000000000002
PLUTO_MANIFEST_TOML_CONTENTS = """
# This file is machine-generated - editing it directly is not advised

julia_version = "1.12.5"
manifest_format = "2.0"
project_hash = "eb700237a80eb987d0937deeef79d16ad6289ff8"

[[deps.DelimitedFiles]]
deps = ["Mmap"]
git-tree-sha1 = "9e2f36d3c96a820c678f2f1f1782582fcf685bae"
uuid = "8bb1440f-4735-579b-a4ab-409b98df4dab"
version = "1.9.1"

[[deps.Mmap]]
uuid = "a63ad114-7e13-5084-954f-fe012c677804"
version = "1.11.0"

[[deps.SHA]]
uuid = "ea8e919c-243c-51af-8825-aaa63cd721ce"
version = "0.7.0"
"""

# ╔═╡ Cell order:
# ╠═6b1d0101-0000-11f1-9a01-000000000001
# ╟─6b1d0102-0000-11f1-9a01-000000000002
# ╟─6b1d0103-0000-11f1-9a01-000000000003
# ╠═6b1d0104-0000-11f1-9a01-000000000004
# ╠═6b1d0105-0000-11f1-9a01-000000000005
# ╠═6b1d0106-0000-11f1-9a01-000000000006
# ╟─6b1d0107-0000-11f1-9a01-000000000007
# ╠═6b1d0108-0000-11f1-9a01-000000000008
# ╠═6b1d0109-0000-11f1-9a01-000000000009
# ╠═6b1d0110-0000-11f1-9a01-000000000010
# ╟─6b1d0111-0000-11f1-9a01-000000000011
# ╠═6b1d0112-0000-11f1-9a01-000000000012
# ╠═6b1d0113-0000-11f1-9a01-000000000013
# ╟─6b1d0114-0000-11f1-9a01-000000000014
# ╠═6b1d0115-0000-11f1-9a01-000000000015
# ╠═6b1d0116-0000-11f1-9a01-000000000016
# ╠═6b1d0117-0000-11f1-9a01-000000000017
# ╟─6b1d0118-0000-11f1-9a01-000000000018
# ╠═6b1d0119-0000-11f1-9a01-000000000019
# ╠═6b1d0120-0000-11f1-9a01-000000000020
# ╟─6b1d0121-0000-11f1-9a01-000000000021
# ╟─6b1d0122-0000-11f1-9a01-000000000022
# ╟─00000000-0000-0000-0000-000000000001
# ╟─00000000-0000-0000-0000-000000000002
