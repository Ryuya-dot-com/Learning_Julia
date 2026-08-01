### A Pluto.jl notebook ###
# v1.0.3

using Markdown
using InteractiveUtils

# ╔═╡ 5eed1a01-0000-11f1-9a01-000000000001
begin
    using DataFrames, Random, Statistics, Distributions, GLM
    using MixedModels
end

# ╔═╡ 5eed1a02-0000-11f1-9a01-000000000002
md"""
# NB5: 測定・依存構造・研究計画編の演習ノート(卒業制作つき)

**はじめてのJulia — STEP 5（「古典的テスト理論と項目分析」から「デザインの検定力設計」まで）の実践編**です。

このノートは**任意実装ラボ**です。アプリ本文の必須概念と出力読解を終えたあと、Juliaで再現したい課題だけ選んでください。ノートを実行しなくてもSTEP 5の学習は完了できます。

`# TODO` のセルを書きかえて、下の判定セルが ✅ になったらクリアです。順番どおりの完走は必須ではありません。最後の課題を研究計画へ転用するときは、数字を自分のデザインと根拠に置き換えてください。

MixedModels の初回準備には数分かかることがあります。packageの準備や計算時間が負担なら、本文の掲載出力を読む段階で止めて構いません。

!!! tip "Pluto の約束ごと"
    1つのセルに書ける式は1つです。複数の処理は `( 式; 式 )` か `begin ... end` で囲みます。
"""

# ╔═╡ 5eed1a31-0000-11f1-9a01-000000000031
md"""
## 課題1: 項目自身を除いて相関する（「古典的テスト理論と項目分析」）

600人×8項目の二値反応 `ctt_items` を用意しました。項目8だけ採点方向が逆です。

各項目の通過率、`項目j` 対 `合計−項目j` の修正済み項目–合計相関、項目8を再得点した後のαとKR-20を計算し、NamedTuple `ctt_stats` に入れましょう。

修正済み相関の残り得点は `ctt_total .- ctt_items[:, j]` です。KR-20では再得点後の各列平均pと `p(1-p)` を使います。
"""

# ╔═╡ 5eed1a32-0000-11f1-9a01-000000000032
begin
    ctt_logistic(x) = 1 / (1 + exp(-x))
    function make_ctt_items()
        rng = Xoshiro(3201)
        theta = randn(rng, 600)
        difficulty = [-1.5, -1.0, -0.5, 0.0, 0.4, 0.8, 1.2, 0.0]
        discrimination = [1.4, 1.2, 1.1, 1.3, 1.0, 0.9, 1.2, -0.7]
        probability = ctt_logistic.(
            discrimination' .* (theta .- difficulty'))
        return Int.(rand(rng, size(probability)...) .< probability)
    end
    ctt_items = make_ctt_items()
    ctt_total = vec(sum(ctt_items, dims = 2))
    ctt_scored = copy(ctt_items)
    ctt_scored[:, 8] .= 1 .- ctt_scored[:, 8]
    ctt_scored_total = vec(sum(ctt_scored, dims = 2))
    function coefficient_alpha_nb(items)
        k = size(items, 2)
        total = vec(sum(items, dims = 2))
        k / (k - 1) * (1 - sum(vec(var(items, dims = 1))) / var(total))
    end
end

# ╔═╡ 5eed1a33-0000-11f1-9a01-000000000033
ctt_stats = missing # TODO: (pass_rate = ..., corrected = ..., alpha = ..., kr20 = ...)

# ╔═╡ 5eed1a34-0000-11f1-9a01-000000000034
if ctt_stats === missing
    md"⏳ 通過率・修正済み相関に加え、`alpha = coefficient_alpha_nb(ctt_scored)` と、p(1−p)から作る `kr20` を持つNamedTupleにします。"
elseif ctt_stats isa NamedTuple && hasproperty(ctt_stats, :pass_rate) &&
       hasproperty(ctt_stats, :corrected) &&
       hasproperty(ctt_stats, :alpha) && hasproperty(ctt_stats, :kr20) &&
       length(ctt_stats.pass_rate) == 8 && length(ctt_stats.corrected) == 8 &&
       isapprox(ctt_stats.pass_rate[4], 0.518; atol = 0.002) &&
       isapprox(ctt_stats.corrected[8], -0.197; atol = 0.002) &&
       isapprox(ctt_stats.alpha, 0.642; atol = 0.002) &&
       isapprox(ctt_stats.kr20, ctt_stats.alpha; atol = 1e-10)
    md"""✅ **正解!** 項目4の通過率は0.518、逆採点の項目8は修正済み相関−0.197です。再得点後のαとKR-20はともに0.642でした。

    負の値は採点キー・項目内容・回答過程へ戻る警告です。KR-20が別の妥当性証拠ではなく、二値項目におけるαと同じ分散分解であることも確認できました。"""
elseif ctt_stats isa NamedTuple
    md"🤔 NamedTupleはできています。修正済み相関、再得点後のα、同じ標本分散規約のKR-20を確認してください。"
else
    md"🤔 `pass_rate` と `corrected` の2要素を持つNamedTupleにしましょう。"
end

# ╔═╡ 5eed1a35-0000-11f1-9a01-000000000035
md"""
## 課題2: MTMMの相関パターンを要約する（「収束的・弁別的妥当性」）

trait A・B・Cをselfとobserverの2方法で測った6得点の相関行列 `mtmm_R` を用意しました。

同trait×異methodの3相関の平均を `convergent`、異trait×同methodの6相関の平均を `same_method` とするNamedTuple `mtmm_pattern` を作りましょう。
"""

# ╔═╡ 5eed1a36-0000-11f1-9a01-000000000036
mtmm_R = let
    rng = Xoshiro(3301)
    n = 1000
    trait_R = [1.0 0.30 0.10; 0.30 1.0 0.20; 0.10 0.20 1.0]
    trait = rand(rng, MvNormal(zeros(3), trait_R), n)'
    method = randn(rng, n, 2)
    score = Matrix{Float64}(undef, n, 6)
    for m in 1:2, t in 1:3
        column = (m - 1) * 3 + t
        score[:, column] = 0.75 .* trait[:, t] .+
            0.35 .* method[:, m] .+ 0.40 .* randn(rng, n)
    end
    cor(score)
end

# ╔═╡ 5eed1a37-0000-11f1-9a01-000000000037
mtmm_pattern = missing # TODO: (convergent = mean([...]), same_method = mean([...])))

# ╔═╡ 5eed1a38-0000-11f1-9a01-000000000038
if mtmm_pattern === missing
    md"⏳ `(convergent = mean([mtmm_R[1,4], mtmm_R[2,5], mtmm_R[3,6]]), same_method = mean([mtmm_R[1,2], mtmm_R[1,3], mtmm_R[2,3], mtmm_R[4,5], mtmm_R[4,6], mtmm_R[5,6]]))` です。"
elseif mtmm_pattern isa NamedTuple &&
       hasproperty(mtmm_pattern, :convergent) &&
       hasproperty(mtmm_pattern, :same_method) &&
       isapprox(mtmm_pattern.convergent, 0.669; atol = 0.002) &&
       isapprox(mtmm_pattern.same_method, 0.286; atol = 0.002)
    md"""✅ **正解!** 収束平均は$(round(mtmm_pattern.convergent, digits = 3))、異trait×同method平均は$(round(mtmm_pattern.same_method, digits = 3))です。

    収束の方が高い一方、同methodだけでも相関が生まれています。一つの相関ではなく、traitとmethodを交差させたパターンで読みます。"""
elseif mtmm_pattern isa NamedTuple
    md"🤔 NamedTupleはできています。収束は (1,4), (2,5), (3,6)、同methodの異traitは各3×3ブロックの三角部分です。"
else
    md"🤔 `convergent` と `same_method` の2要素を持つNamedTupleにしましょう。"
end

# ╔═╡ 5eed1a03-0000-11f1-9a01-000000000003
md"""
## 課題3: ランダム切片と傾きを復元する（「within／betweenデザインと混合効果モデル」）

個人差つきの反応時間データを作る `make_rt_data` を用意しました。切片500・残差SD50に加え、参加者切片SD30・条件傾きSD20が入っています。

`make_rt_data(20, 10, 40)` — 20人×10試行・条件効果40ms — に、**参加者のランダム切片と `condition_centered` のランダム傾き**を持つモデルを当てはめ、`m1` に入れましょう。
"""

# ╔═╡ 5eed1a04-0000-11f1-9a01-000000000004
begin
    function make_rt_data(n_subj, n_trial, effect;
                          subj_sd = 30, slope_sd = 20, seed = 2026)
        rng = Xoshiro(seed)
        subj = repeat(1:n_subj, inner = n_trial)
        condition_centered = repeat([-0.5, 0.5], outer = n_subj * n_trial ÷ 2)
        u0 = randn(rng, n_subj) .* subj_sd
        u1 = randn(rng, n_subj) .* slope_sd
        rt = 500 .+ effect .* condition_centered .+ u0[subj] .+
             u1[subj] .* condition_centered .+
             randn(rng, n_subj * n_trial) .* 50
        return DataFrame(subj = string.("S", subj),
                         condition_centered = condition_centered, rt = rt)
    end
    subj_sd_of(m) = first(m.σs.subj)   # ランダム切片SDを取り出す小道具
end

# ╔═╡ 5eed1a05-0000-11f1-9a01-000000000005
m1 = missing # TODO: fit(MixedModel, ランダム切片・傾きつきの式, make_rt_data(20, 10, 40))

# ╔═╡ 5eed1a06-0000-11f1-9a01-000000000006
if m1 === missing
    md"⏳ `fit(MixedModel, @formula(rt ~ 1 + condition_centered + (1 + condition_centered | subj)), make_rt_data(20, 10, 40))` です。"
elseif m1 isa MixedModel && length(coef(m1)) == 2 &&
       length(m1.σs.subj) > 1 && 25 <= coef(m1)[2] <= 55
    md"""✅ **正解!** 条件効果の推定は $(round(coef(m1)[2], digits = 1))(真の値40)、参加者切片SDは$(round(subj_sd_of(m1), digits = 1))(真の値30)です。ランダム傾きSDも$(round(last(m1.σs.subj), digits = 1))(真の値20)と推定されました。

    ランダム切片だけでは条件差の個人差を表せません。固定効果と二種類の分散成分を分けて読めました。"""
elseif m1 isa MixedModel
    md"🤔 モデルはできていますが係数かランダム構造が想定と合いません。式に `(1 + condition_centered | subj)` が入っていますか?"
else
    md"🤔 `fit(MixedModel, @formula(...), データ)` の結果をそのまま `m1` に入れましょう。"
end

# ╔═╡ 5eed1a07-0000-11f1-9a01-000000000007
md"""
## 課題4: 個人差の大きさを、推定は追えるか（「within／betweenデザインと混合効果モデル」）

`subj_sd` を10, 30, 60に変えた3つのデータへ、同じランダム切片・傾きモデルを当てます。推定された参加者切片SDを並べた配列 `sds` を作りましょう。`subj_sd_of` を使えば1式で書けます。
"""

# ╔═╡ 5eed1a08-0000-11f1-9a01-000000000008
sds = missing # TODO: subj_sd を 10, 30, 60 にしたモデルから subj_sd_of を並べる

# ╔═╡ 5eed1a09-0000-11f1-9a01-000000000009
if sds === missing
    md"⏳ `[subj_sd_of(fit(MixedModel, @formula(rt ~ 1 + condition_centered + (1 + condition_centered | subj)), make_rt_data(20, 10, 40; subj_sd = s))) for s in [10, 30, 60]]` です。"
elseif sds isa AbstractVector && length(sds) == 3 &&
       sds[1] < 15 && 15 <= sds[2] <= 45 && 40 <= sds[3] <= 80 && issorted(sds)
    md"""✅ **正解!** 推定は $(round(sds[1], digits = 1)) → $(round(sds[2], digits = 1)) → $(round(sds[3], digits = 1))。真の値(10 → 30 → 60)を順序どおり追いかけています。

    ただし真の値10のときの推定はかなり小さめです。個人差が残差(SD50)に埋もれる規模だと、分散成分の推定は不安定になる——これも回してみたから分かることです。"""
elseif sds isa AbstractVector && length(sds) == 3
    md"🤔 値が想定の範囲外です。`subj_sd = s` をキーワード引数として渡していますか?"
else
    md"🤔 3つの数の配列にしましょう。内包表記で s を `make_rt_data(20, 10, 40; subj_sd = s)` に渡します。"
end

# ╔═╡ 5eed1a39-0000-11f1-9a01-000000000039
md"""
## 課題4A: GLMMの条件付き確率と周辺確率を分ける（「within／betweenデザインと混合効果モデル」）

ロジスティックGLMMの計画値として、切片−0.5、条件係数0.9、参加者ランダム切片SD 0.7、項目ランダム切片SD 0.5を置きます。

`glmm_probability_summary` を次のNamedTupleにしましょう。

- `fixed`: ランダム効果を0にした条件0／1の確率
- `marginal`: 参加者・項目のランダム効果を積分した条件0／1の確率
- `conditional_or`: `exp(glmm_beta1)`
- `marginal_or`: 周辺確率をoddsへ変換して作るOR

周辺化には `glmm_random_sd .* glmm_normal_grid` をlogitへ足し、各条件で逆logitの平均を取ります。これは新しい参加者×新しい項目を対象に、既知の分散成分を固定した数値積分です。
"""

# ╔═╡ 5eed1a40-0000-11f1-9a01-000000000040
begin
    glmm_logistic_nb(x) = inv(1 + exp(-x))
    glmm_odds_nb(p) = p / (1 - p)
    glmm_beta0, glmm_beta1 = -0.5, 0.9
    glmm_random_sd = hypot(0.7, 0.5)
    glmm_normal_grid = quantile.(Normal(), ((1:20_000) .- 0.5) ./ 20_000)
end

# ╔═╡ 5eed1a41-0000-11f1-9a01-000000000041
glmm_probability_summary = missing # TODO: fixed, marginal, conditional_or, marginal_or を持つNamedTuple

# ╔═╡ 5eed1a42-0000-11f1-9a01-000000000042
if glmm_probability_summary === missing
    md"⏳ 固定効果予測を先に作り、周辺予測では各条件について `mean(glmm_logistic_nb.(glmm_beta0 + glmm_beta1 * c .+ glmm_random_sd .* glmm_normal_grid))` を計算します。"
elseif glmm_probability_summary isa NamedTuple &&
       hasproperty(glmm_probability_summary, :fixed) &&
       hasproperty(glmm_probability_summary, :marginal) &&
       hasproperty(glmm_probability_summary, :conditional_or) &&
       hasproperty(glmm_probability_summary, :marginal_or) &&
       glmm_probability_summary.fixed isa AbstractVector{<:Real} &&
       glmm_probability_summary.marginal isa AbstractVector{<:Real} &&
       glmm_probability_summary.conditional_or isa Real &&
       glmm_probability_summary.marginal_or isa Real &&
       length(glmm_probability_summary.fixed) == 2 &&
       length(glmm_probability_summary.marginal) == 2 &&
       isapprox(glmm_probability_summary.fixed[1], 0.377541; atol = 1e-5) &&
       isapprox(glmm_probability_summary.fixed[2], 0.598688; atol = 1e-5) &&
       isapprox(glmm_probability_summary.marginal[1], 0.393814; atol = 1e-5) &&
       isapprox(glmm_probability_summary.marginal[2], 0.585370; atol = 1e-5) &&
       isapprox(glmm_probability_summary.conditional_or, 2.459603; atol = 1e-5) &&
       isapprox(glmm_probability_summary.marginal_or, 2.173123; atol = 1e-5)
    md"""✅ **正解!** ランダム効果0の確率は $(round.(glmm_probability_summary.fixed, digits = 3))、周辺確率は $(round.(glmm_probability_summary.marginal, digits = 3)) です。条件付きORは $(round(glmm_probability_summary.conditional_or, digits = 3))、周辺ORは $(round(glmm_probability_summary.marginal_or, digits = 3)) でした。

    逆logitの非線形性により、係数を指数変換したORと周辺ORは一致しません。どちらも介入の因果効果や最適な行動閾値を自動的には与えないため、予測対象・絶対確率・較正・損失を別々に確認します。"""
elseif glmm_probability_summary isa NamedTuple
    md"🤔 NamedTupleはできています。周辺確率では両ランダム切片の合成SDを使い、確率へ戻した**後**に平均しているか確認しましょう。"
else
    md"🤔 `fixed`、`marginal`、`conditional_or`、`marginal_or`を持つNamedTupleにしましょう。"
end

# ╔═╡ 5eed1a43-0000-11f1-9a01-000000000043
md"""
## 課題4B: 配備対象ごとに確率予測を採点する（「within／betweenデザインと混合効果モデル」）

参加者300人×項目30個の0/1反応を用意します。`known_probability`は真の参加者・項目効果を知る**上限ベンチマーク**、`fixed_zero_probability`はランダム効果0、`marginal_deployment_probability`は両ランダム効果を積分した未知水準向け予測です。

`deployment_metric_summary`を、各予測について`deployment_score_nb`を呼んだ次のNamedTupleにしましょう。

- `known`: `known_probability`のBrier scoreとlog loss
- `fixed_zero`: `fixed_zero_probability`のBrier scoreとlog loss
- `marginal`: `marginal_deployment_probability`のBrier scoreとlog loss

小さい方が良い指標です。ただし、真のランダム効果を使う`known`は実際の交差検証性能ではありません。
"""

# ╔═╡ 5eed1a44-0000-11f1-9a01-000000000044
begin
    rng_deployment_nb = Xoshiro(3411)
    n_deployment_subj, n_deployment_item = 300, 30
    deployment_subj_effect = 1.5 .* randn(rng_deployment_nb, n_deployment_subj)
    deployment_item_effect = randn(rng_deployment_nb, n_deployment_item)
    deployment_subj = repeat(1:n_deployment_subj, inner = n_deployment_item)
    deployment_item = repeat(1:n_deployment_item, outer = n_deployment_subj)
    deployment_condition = [isodd(s + i) ? 1 : 0 for
        (s, i) in zip(deployment_subj, deployment_item)]
    deployment_eta = -2.0 .+ 1.2 .* deployment_condition .+
        deployment_subj_effect[deployment_subj] .+
        deployment_item_effect[deployment_item]
    known_probability = glmm_logistic_nb.(deployment_eta)
    deployment_response = Int.(rand(rng_deployment_nb, length(deployment_eta)) .<
                               known_probability)
    fixed_zero_probability = glmm_logistic_nb.(
        -2.0 .+ 1.2 .* deployment_condition)

    deployment_grid = quantile.(Normal(), ((1:20_000) .- 0.5) ./ 20_000)
    deployment_random_sd = hypot(1.5, 1.0)
    marginal_by_condition = [mean(glmm_logistic_nb.(
        -2.0 + 1.2 * c .+ deployment_random_sd .* deployment_grid))
        for c in (0, 1)]
    marginal_deployment_probability = [marginal_by_condition[c + 1]
        for c in deployment_condition]

    function deployment_score_nb(probability)
        q = clamp.(probability, eps(Float64), 1 - eps(Float64))
        return (
            brier = mean((deployment_response .- q) .^ 2),
            log_loss = mean(-deployment_response .* log.(q) .-
                            (1 .- deployment_response) .* log1p.(-q)),
        )
    end
end

# ╔═╡ 5eed1a45-0000-11f1-9a01-000000000045
deployment_metric_summary = missing # TODO: known, fixed_zero, marginal を持つNamedTuple

# ╔═╡ 5eed1a46-0000-11f1-9a01-000000000046
if deployment_metric_summary === missing
    md"⏳ `(known = deployment_score_nb(known_probability), fixed_zero = deployment_score_nb(fixed_zero_probability), marginal = deployment_score_nb(marginal_deployment_probability))`です。"
elseif deployment_metric_summary isa NamedTuple &&
       hasproperty(deployment_metric_summary, :known) &&
       hasproperty(deployment_metric_summary, :fixed_zero) &&
       hasproperty(deployment_metric_summary, :marginal) &&
       deployment_metric_summary.known isa NamedTuple &&
       deployment_metric_summary.fixed_zero isa NamedTuple &&
       deployment_metric_summary.marginal isa NamedTuple &&
       hasproperty(deployment_metric_summary.known, :brier) &&
       hasproperty(deployment_metric_summary.known, :log_loss) &&
       hasproperty(deployment_metric_summary.fixed_zero, :brier) &&
       hasproperty(deployment_metric_summary.fixed_zero, :log_loss) &&
       hasproperty(deployment_metric_summary.marginal, :brier) &&
       hasproperty(deployment_metric_summary.marginal, :log_loss) &&
       deployment_metric_summary.known.brier isa Real &&
       deployment_metric_summary.known.log_loss isa Real &&
       deployment_metric_summary.fixed_zero.brier isa Real &&
       deployment_metric_summary.fixed_zero.log_loss isa Real &&
       deployment_metric_summary.marginal.brier isa Real &&
       deployment_metric_summary.marginal.log_loss isa Real &&
       isapprox(deployment_metric_summary.known.brier, 0.136946; atol = 1e-5) &&
       isapprox(deployment_metric_summary.known.log_loss, 0.424227; atol = 1e-5) &&
       isapprox(deployment_metric_summary.fixed_zero.brier, 0.212773; atol = 1e-5) &&
       isapprox(deployment_metric_summary.fixed_zero.log_loss, 0.624081; atol = 1e-5) &&
       isapprox(deployment_metric_summary.marginal.brier, 0.204680; atol = 1e-5) &&
       isapprox(deployment_metric_summary.marginal.log_loss, 0.597593; atol = 1e-5)
    md"""✅ **正解!** Brier scoreは、上限ベンチマーク $(round(deployment_metric_summary.known.brier, digits = 3))、ランダム効果0 $(round(deployment_metric_summary.fixed_zero.brier, digits = 3))、周辺予測 $(round(deployment_metric_summary.marginal.brier, digits = 3)) でした。log lossも同じ順序です。

    既知のランダム効果を使えば有利ですが、未知の参加者・項目には利用できません。未知水準では、ランダム効果0の逆logitと分布を積分した周辺確率も一致せず、この例では周辺予測の方が改善しました。実務では真の効果ではなく、配備単位を保留した外側foldから性能を推定します。"""
elseif deployment_metric_summary isa NamedTuple
    md"🤔 NamedTupleはできています。各欄へ同名の確率配列を`deployment_score_nb`で採点した結果を入れてください。"
else
    md"🤔 `known`、`fixed_zero`、`marginal`を持つNamedTupleにしましょう。"
end

# ╔═╡ 5eed1a47-0000-11f1-9a01-000000000047
md"""
## 課題4C: パネルのformulaをシナリオから組み立てる（「within／betweenデザインと混合効果モデル」）

100人をbaselineから11か月後まで追跡した`panel_nb`があります。`treatment`は参加者ごとに一度だけ割付、`time_since_baseline`と`x_within`は参加者内、`x_between`は参加者間です。

次をすべて含むGaussian LMMを`panel_model_nb`へ入れましょう。

- 固定効果: time、treatment、time×treatment、x_between、x_within
- ランダム効果: 参加者ごとの切片とtime傾き

formulaの交互作用は`time_since_baseline & treatment`、ランダム項は`(1 + time_since_baseline | subj)`です。
"""

# ╔═╡ 5eed1a48-0000-11f1-9a01-000000000048
begin
    function make_panel_nb(; n_subj = 100, n_time = 12, seed = 3420)
        rng = Xoshiro(seed)
        treatment_by_subj = repeat([0, 1], inner = div(n_subj, 2))
        x_mean_by_subj = randn(rng, n_subj)
        subj_intercept = 3 .* randn(rng, n_subj)
        subj_time_slope = 0.6 .* randn(rng, n_subj)
        subj_index = Int[]
        time_since_baseline = Float64[]
        treatment = Int[]
        x_between = Float64[]
        x_within = Float64[]
        outcome = Float64[]
        for s in 1:n_subj
            previous_error = 0.0
            for time in 0:(n_time - 1)
                within = randn(rng)
                error = 0.7 * previous_error + 2 * randn(rng)
                y = 50 + 2 * time + 5 * treatment_by_subj[s] +
                    1.5 * time * treatment_by_subj[s] + 3 * x_mean_by_subj[s] +
                    within + subj_intercept[s] + subj_time_slope[s] * time + error
                push!(subj_index, s); push!(time_since_baseline, time)
                push!(treatment, treatment_by_subj[s])
                push!(x_between, x_mean_by_subj[s]); push!(x_within, within)
                push!(outcome, y)
                previous_error = error
            end
        end
        return DataFrame(
            subj_index = subj_index, subj = string.("S", subj_index),
            time_since_baseline = time_since_baseline, treatment = treatment,
            x_between = x_between, x_within = x_within, outcome = outcome,
        )
    end

    function panel_lag1_nb(model, data; n_time = 12)
        residual = data.outcome .- fitted(model)
        previous = Float64[]
        following = Float64[]
        for s in 1:div(nrow(data), n_time)
            index = ((s - 1) * n_time + 1):(s * n_time)
            append!(previous, residual[index[1:(end - 1)]])
            append!(following, residual[index[2:end]])
        end
        cor(previous, following)
    end

    panel_nb = make_panel_nb()
end

# ╔═╡ 5eed1a49-0000-11f1-9a01-000000000049
panel_model_nb = missing # TODO: 固定効果6項と参加者別の切片・time傾きを持つLMM

# ╔═╡ 5eed1a50-0000-11f1-9a01-000000000050
if panel_model_nb === missing
    md"⏳ `fit(MixedModel, @formula(outcome ~ 1 + time_since_baseline + treatment + time_since_baseline & treatment + x_between + x_within + (1 + time_since_baseline | subj)), panel_nb)`です。"
elseif panel_model_nb isa MixedModel &&
       length(coef(panel_model_nb)) == 6 &&
       "time_since_baseline & treatment" in coefnames(panel_model_nb) &&
       "x_between" in coefnames(panel_model_nb) &&
       "x_within" in coefnames(panel_model_nb) &&
       hasproperty(panel_model_nb.σs, :subj) &&
       length(panel_model_nb.σs.subj) == 2 &&
       1.8 <= coef(panel_model_nb)[2] <= 2.25 &&
       0.85 <= coef(panel_model_nb)[5] <= 1.15 &&
       1.2 <= coef(panel_model_nb)[6] <= 1.75 &&
       !MixedModels.issingular(panel_model_nb)
    panel_time_value = round(coef(panel_model_nb)[2], digits = 3)
    panel_interaction_value = round(coef(panel_model_nb)[6], digits = 3)
    panel_within_value = round(coef(panel_model_nb)[5], digits = 3)
    panel_lag1_value = panel_lag1_nb(panel_model_nb, panel_nb)
    panel_lag1_rounded = round(panel_lag1_value, digits = 3)
    Markdown.parse("""✅ **正解!** time効果は""" * string(panel_time_value) *
        "、time×treatmentは" * string(panel_interaction_value) *
        "、x_withinは" * string(panel_within_value) *
        """です。参加者別time傾きも復元できました。

        ただし条件付き残差のlag-1相関は""" * string(panel_lag1_rounded) *
        "残ります。ランダム時間傾きは個人別軌跡、lag相関は軌跡後の短期依存なので、別々に診断します。")
elseif panel_model_nb isa MixedModel
    md"🤔 LMMはできています。固定効果のtime×treatment・between・withinと、`(1 + time_since_baseline | subj)`の両方を確認してください。"
else
    md"🤔 `fit(MixedModel, @formula(...), panel_nb)`の結果をそのまま入れましょう。"
end

# ╔═╡ 5eed1a10-0000-11f1-9a01-000000000010
md"""
## 課題5: 相関の希薄化と回帰の非対称性を分ける（「測定誤差と希薄化」）

真の相関 0.7 のペアを、信頼性 `rel` の測定で観測したときの相関を返す `observed_cor` を用意しました。

さらに、同じ信頼性の誤差を**結果変数**へ入れた傾きと、**説明変数**へ入れた傾きを返す `measurement_error_slopes` も用意します。

`measurement_effects` を次のNamedTupleにしましょう。

- `correlations`: `rel` = 1.0, 0.8, 0.5 の観測相関
- `slopes`: `measurement_error_slopes(0.6)` の結果
"""

# ╔═╡ 5eed1a11-0000-11f1-9a01-000000000011
begin
    function observed_cor(rel; n = 10_000, seed = 2026)
        rng = Xoshiro(seed)
        mv = MvNormal([0.0, 0.0], [1.0 0.7; 0.7 1.0])
        T = rand(rng, mv, n)
        e = sqrt(1 / rel - 1)
        x = T[1, :] .+ randn(rng, n) .* e
        y = T[2, :] .+ randn(rng, n) .* e
        return cor(x, y)
    end

    function measurement_error_slopes(rel; n = 20_000, seed = 3503)
        rng = Xoshiro(seed)
        x_true = randn(rng, n)
        y_true = 2 .+ 1.5 .* x_true .+ randn(rng, n)
        x_observed = x_true .+ sqrt(1 / rel - 1) .* randn(rng, n)
        y_error_sd = std(y_true) * sqrt(1 / rel - 1)
        y_observed = y_true .+ y_error_sd .* randn(rng, n)
        df = DataFrame(x_true = x_true, x_observed = x_observed,
                       y_true = y_true, y_observed = y_observed)
        error_in_y = lm(@formula(y_observed ~ 1 + x_true), df)
        error_in_x = lm(@formula(y_true ~ 1 + x_observed), df)
        return (outcome = coef(error_in_y)[2], predictor = coef(error_in_x)[2])
    end
end

# ╔═╡ 5eed1a12-0000-11f1-9a01-000000000012
measurement_effects = missing # TODO: (correlations = [observed_cor(rel) for rel in [1.0, 0.8, 0.5]], slopes = measurement_error_slopes(0.6))

# ╔═╡ 5eed1a13-0000-11f1-9a01-000000000013
if measurement_effects === missing
    md"⏳ `(correlations = [observed_cor(rel) for rel in [1.0, 0.8, 0.5]], slopes = measurement_error_slopes(0.6))` です。"
elseif measurement_effects isa NamedTuple &&
       hasproperty(measurement_effects, :correlations) &&
       hasproperty(measurement_effects, :slopes) &&
       length(measurement_effects.correlations) == 3 &&
       0.66 <= measurement_effects.correlations[1] <= 0.73 &&
       0.51 <= measurement_effects.correlations[2] <= 0.60 &&
       0.30 <= measurement_effects.correlations[3] <= 0.38 &&
       issorted(measurement_effects.correlations, rev = true) &&
       1.42 <= measurement_effects.slopes.outcome <= 1.58 &&
       0.83 <= measurement_effects.slopes.predictor <= 0.97
    md"""✅ **正解!** 相関は $(round.(measurement_effects.correlations, digits = 2))。傾きは結果誤差 $(round(measurement_effects.slopes.outcome, digits = 2))、説明変数誤差 $(round(measurement_effects.slopes.predictor, digits = 2)) でした。

    古典的独立誤差でも、結果誤差は生傾きをほぼ保って精度を落とし、説明変数誤差は傾きを約 `1.5 × 0.6 = 0.9` へ希薄化します。"""
elseif measurement_effects isa NamedTuple
    md"🤔 値が想定と合いません。correlationsのrel順と、measurement_error_slopesへ渡す0.6を確認しましょう。"
else
    md"🤔 `correlations` と `slopes` を持つNamedTupleにしましょう。"
end

# ╔═╡ 5eed1a14-0000-11f1-9a01-000000000014
md"""
## 課題6: 卒業制作 — 自分のデザインの検定力（「デザインの検定力設計」）

参加者×項目の交差ランダム傾きを持つ検定力シミュレーションを、種固定・200回版で用意しました。

まずは講義と同じ **24人×12項目×2条件・効果20ms** の結果を `design_result` に入れましょう。検定力だけでなく、MCSE、Wilson区間、singular率を一緒に読みます。
"""

# ╔═╡ 5eed1a15-0000-11f1-9a01-000000000015
begin
    function simulate_power_y(rng, subj, item, cc, n_subj, n_item, effect;
                              subj_slope_sd = 25, item_slope_sd = 15,
                              reliability = 0.8)
        u0, u1 = 60 .* randn(rng, n_subj), subj_slope_sd .* randn(rng, n_subj)
        v0, v1 = 30 .* randn(rng, n_item), item_slope_sd .* randn(rng, n_item)
        measurement_sd = 50 * sqrt(1 / reliability - 1)
        return 500 .+ effect .* cc .+ u0[subj] .+ u1[subj] .* cc .+
               v0[item] .+ v1[item] .* cc .+ 50 .* randn(rng, length(cc)) .+
               measurement_sd .* randn(rng, length(cc))
    end

    function power_lmm_nb(n_subj, n_item, effect; nsim = 200, seed = 3601,
                          subj_slope_sd = 25, item_slope_sd = 15,
                          reliability = 0.8)
        rng = Xoshiro(seed)
        subj = repeat(1:n_subj, inner = 2n_item)
        item = repeat(repeat(1:n_item, inner = 2), outer = n_subj)
        cc = repeat([-0.5, 0.5], outer = n_subj * n_item)
        first_y = simulate_power_y(rng, subj, item, cc, n_subj, n_item, effect;
            subj_slope_sd, item_slope_sd, reliability)
        df = DataFrame(subj = string.("S", subj), item = string.("I", item),
                       condition_centered = cc, y = first_y)
        m = fit(MixedModel,
            @formula(y ~ 1 + condition_centered +
                         zerocorr(1 + condition_centered | subj) +
                         zerocorr(1 + condition_centered | item)),
            df; progress = false)
        hits = singular = 0
        for simulation in 1:nsim
            y = simulation == 1 ? first_y :
                simulate_power_y(rng, subj, item, cc, n_subj, n_item, effect;
                    subj_slope_sd, item_slope_sd, reliability)
            refit!(m, y; progress = false)
            hits += abs(coef(m)[2] / stderror(m)[2]) > 1.96
            singular += MixedModels.issingular(m)
        end
        power = hits / nsim
        mcse = sqrt(power * (1 - power) / nsim)
        z = 1.959963984540054
        denominator = 1 + z^2 / nsim
        center = (power + z^2 / (2nsim)) / denominator
        half = z * sqrt(power * (1 - power) / nsim + z^2 / (4nsim^2)) / denominator
        return (; power, mcse, lower = center - half, upper = center + half,
                singular_rate = singular / nsim)
    end
end

# ╔═╡ 5eed1a16-0000-11f1-9a01-000000000016
design_result = missing # TODO: power_lmm_nb(24, 12, 20)

# ╔═╡ 5eed1a17-0000-11f1-9a01-000000000017
if design_result === missing
    md"⏳ `power_lmm_nb(24, 12, 20)` を呼びます(200回なので少し待ちます)。"
elseif design_result isa NamedTuple &&
       0.62 <= design_result.power <= 0.80 &&
       0.025 <= design_result.mcse <= 0.040 &&
       design_result.lower < design_result.power < design_result.upper &&
       0.05 <= design_result.singular_rate <= 0.30
    md"""✅ **正解!** 検定力 $(round(100 * design_result.power, digits = 1))%、MCSE $(round(100 * design_result.mcse, digits = 1))ポイント、Wilson区間 $(round.(100 .* [design_result.lower, design_result.upper], digits = 1))%、singular $(round(100 * design_result.singular_rate, digits = 1))%です。

    一つの点推定だけで80%合格とは判定しません。参加者・項目・効果・傾き分散・信頼性を動かし、第I種過誤と解析失敗も含めて比較するのが卒業制作です。"""
elseif design_result isa NamedTuple
    md"🤔 値が想定範囲外です。引数は(24, 12, 20)、既定seedは3601ですか?"
else
    md"🤔 `power_lmm_nb(24, 12, 20)`が返すNamedTupleをそのまま入れましょう。"
end

# ╔═╡ 5eed1a18-0000-11f1-9a01-000000000018
md"""
## 自由課題(卒業制作のつづき)

1. 課題1で誤採点のままのαと再得点後のαを比べ、負の項目共分散が合計得点へ与える影響を確認する
2. 課題2で異trait×異methodの6相関も平均し、収束・同method・異methodの順序を比べる
3. **参加者2倍 vs 項目2倍**: `power_lmm_nb(48, 12, 20)` と `power_lmm_nb(24, 24, 20)` を比べる
4. 効果を10msにして、MCSEと区間を含めて性能を読み直す
5. `subj_slope_sd=45, item_slope_sd=30` と `reliability=0.5` の悲観シナリオを比べる
6. 課題5で信頼性を0.4〜0.9へ動かし、相関・結果誤差のSE・説明変数傾きがどう変わるかを図にする
7. 課題4Aでランダム効果SDを0〜1.5へ動かし、条件付きOR、周辺OR、二つの確率差を図にする
8. 課題4Bをleave-subject-out／leave-item-out／二軸保留へ拡張し、各fold内で再適合・再較正・閾値選択をやり直す
9. 課題4Cでtimeを中央時点へ再中心化し、適合値を保ったまま切片・treatment係数・切片–傾き相関の意味がどう変わるか確認する

---

これで「はじめてのJulia」の番号つき37本+ノートブック5冊は完走です。おつかれさまでした!

ここから先は、R・Stan連携の任意トラック(RCallでlavaanを呼ぶ、CmdStanへmodelを渡す、など)と補講がいつでも待っています。そして何より——**あなたの研究データが、次の教材です。**
"""

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
DataFrames = "a93c6f00-e57d-5684-b7b6-d8193f3e46c0"
Distributions = "31c24e10-a181-5473-b8eb-7969acd0382f"
GLM = "38e38edf-8417-5370-95a0-9cbb8c7f171a"
MixedModels = "ff71e718-51f3-5ec2-a782-8ffcbfa3c316"
Random = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
Statistics = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"

[compat]
DataFrames = "~1.8.2"
Distributions = "~0.25.130"
GLM = "~1.9.5"
MixedModels = "~5.8.0"
"""

# ╔═╡ 00000000-0000-0000-0000-000000000002
PLUTO_MANIFEST_TOML_CONTENTS = """
# This file is machine-generated - editing it directly is not advised

julia_version = "1.12.5"
manifest_format = "2.0"
project_hash = "6d4d2f08fa49bbe372ba0787586fff41a49c8010"

[[deps.Accessors]]
deps = ["CompositionsBase", "ConstructionBase", "Dates", "InverseFunctions", "MacroTools"]
git-tree-sha1 = "7063ad1083578215c7c4bf410368150abe8d5524"
uuid = "7d9f7c33-5ae7-4f3b-8dc6-eff91059b697"
version = "0.1.45"

    [deps.Accessors.extensions]
    AxisKeysExt = "AxisKeys"
    IntervalSetsExt = "IntervalSets"
    LinearAlgebraExt = "LinearAlgebra"
    StaticArraysExt = "StaticArrays"
    StructArraysExt = "StructArrays"
    TestExt = "Test"
    UnitfulExt = "Unitful"

    [deps.Accessors.weakdeps]
    AxisKeys = "94b1ba4f-4ee9-5380-92f1-94cde586c3c5"
    IntervalSets = "8197267c-284f-5f27-9208-e0e47529a953"
    LinearAlgebra = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
    StaticArrays = "90137ffa-7385-5640-81b9-e52037218182"
    StructArrays = "09ab397b-f2b6-538f-b94a-2f83cf4a842a"
    Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"
    Unitful = "1986cc42-f94f-5a68-af5c-568840ba703d"

[[deps.Adapt]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "daa72978cd7a624246e894a4f4f067706d4e17e2"
uuid = "79e6a3ab-5dfb-504d-930d-738a2a938a0e"
version = "4.7.0"
weakdeps = ["SparseArrays", "StaticArrays"]

    [deps.Adapt.extensions]
    AdaptSparseArraysExt = "SparseArrays"
    AdaptStaticArraysExt = "StaticArrays"

[[deps.AliasTables]]
deps = ["PtrArrays", "Random"]
git-tree-sha1 = "9876e1e164b144ca45e9e3198d0b689cadfed9ff"
uuid = "66dad0bd-aa9a-41b7-9441-69ab47430ed8"
version = "1.1.3"

[[deps.ArgTools]]
uuid = "0dad84c5-d112-42e6-8d28-ef12dabb789f"
version = "1.1.2"

[[deps.ArrayLayouts]]
deps = ["FillArrays", "LinearAlgebra", "StaticArrays"]
git-tree-sha1 = "e0b47732a192dd59b9d079a06d04235e2f833963"
uuid = "4c555306-a7a7-4459-81d9-ec55ddd5c99a"
version = "1.12.2"
weakdeps = ["SparseArrays"]

    [deps.ArrayLayouts.extensions]
    ArrayLayoutsSparseArraysExt = "SparseArrays"

[[deps.Arrow]]
deps = ["ArrowTypes", "BitIntegers", "CodecLz4", "CodecZstd", "ConcurrentUtilities", "DataAPI", "Dates", "EnumX", "Mmap", "PooledArrays", "SentinelArrays", "StringViews", "Tables", "TimeZones", "TranscodingStreams", "UUIDs"]
git-tree-sha1 = "4a69a3eadc1f7da78d950d1ef270c3a62c1f7e01"
uuid = "69666777-d1a9-59fb-9406-91d4454c9d45"
version = "2.8.1"

[[deps.ArrowTypes]]
deps = ["Sockets", "UUIDs"]
git-tree-sha1 = "404265cd8128a2515a81d5eae16de90fdef05101"
uuid = "31f734f8-188a-4ce0-8406-c8a06bd891cd"
version = "2.3.0"

[[deps.Artifacts]]
uuid = "56f22d72-fd6d-98f1-02f0-08ddc0907c33"
version = "1.11.0"

[[deps.BSplineKit]]
deps = ["ArrayLayouts", "BandedMatrices", "FastGaussQuadrature", "ForwardDiff", "LinearAlgebra", "PrecompileTools", "Random", "Reexport", "SparseArrays", "Static", "StaticArrays", "StaticArraysCore", "StatsAPI"]
git-tree-sha1 = "02d491054afeb89b7f34331701e4474eb0b904f7"
uuid = "093aae92-e908-43d7-9660-e50ee39d5a0a"
version = "0.19.2"

[[deps.BandedMatrices]]
deps = ["ArrayLayouts", "FillArrays", "LinearAlgebra", "PrecompileTools"]
git-tree-sha1 = "02fa77c70ba84361b9bc9ff28523bd9d78519265"
uuid = "aae01518-5342-5314-be14-df237901396f"
version = "1.11.0"

    [deps.BandedMatrices.extensions]
    BandedMatricesSparseArraysExt = "SparseArrays"
    CliqueTreesExt = "CliqueTrees"

    [deps.BandedMatrices.weakdeps]
    CliqueTrees = "60701a23-6482-424a-84db-faee86b9b1f8"
    SparseArrays = "2f01184e-e22b-5df5-ae63-d93ebab69eaf"

[[deps.Base64]]
uuid = "2a0f44e3-6c83-55bd-87e4-b1978d98bd5f"
version = "1.11.0"

[[deps.BitIntegers]]
deps = ["Random"]
git-tree-sha1 = "091d591a060e43df1dd35faab3ca284925c48e46"
uuid = "c3b6d118-76ef-56ca-8cc7-ebb389d030a1"
version = "0.3.7"

[[deps.CEnum]]
git-tree-sha1 = "389ad5c84de1ae7cf0e28e381131c98ea87d54fc"
uuid = "fa961155-64e5-5f13-b03f-caf6b980ea82"
version = "0.5.0"

[[deps.CodecLz4]]
deps = ["Lz4_jll", "TranscodingStreams"]
git-tree-sha1 = "d58afcd2833601636b48ee8cbeb2edcb086522c2"
uuid = "5ba52731-8f18-5e0d-9241-30f10d1ec561"
version = "0.4.6"

[[deps.CodecZstd]]
deps = ["TranscodingStreams", "Zstd_jll"]
git-tree-sha1 = "da54a6cd93c54950c15adf1d336cfd7d71f51a56"
uuid = "6b39b394-51ab-5f42-8807-6242bab2b4c2"
version = "0.8.7"

[[deps.Combinatorics]]
git-tree-sha1 = "c761b00e7755700f9cdf5b02039939d1359330e1"
uuid = "861a8166-3701-5b0c-9a16-15d98fcdc6aa"
version = "1.1.0"

[[deps.CommonSolve]]
git-tree-sha1 = "f54afab101687a7049833d07636418a83e9a250b"
uuid = "38540f10-b2f7-11e9-35d8-d573e4eb0ff2"
version = "0.2.12"

[[deps.CommonSubexpressions]]
deps = ["MacroTools"]
git-tree-sha1 = "cda2cfaebb4be89c9084adaca7dd7333369715c5"
uuid = "bbf7d656-a473-5ed7-a52c-81e309532950"
version = "0.3.1"

[[deps.CommonWorldInvalidations]]
git-tree-sha1 = "ef2022bff55342a8c9846cdf218f62e475f0444d"
uuid = "f70d9fcc-98c5-4d4a-abd7-e4cdeebd8ca8"
version = "1.1.2"

[[deps.Compat]]
deps = ["TOML", "UUIDs"]
git-tree-sha1 = "9d8a54ce4b17aa5bdce0ea5c34bc5e7c340d16ad"
uuid = "34da2185-b29b-5c13-b0c7-acf172513d20"
version = "4.18.1"
weakdeps = ["Dates", "LinearAlgebra"]

    [deps.Compat.extensions]
    CompatLinearAlgebraExt = "LinearAlgebra"

[[deps.CompilerSupportLibraries_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "e66e0078-7015-5450-92f7-15fbd957f2ae"
version = "1.3.0+1"

[[deps.CompositionsBase]]
git-tree-sha1 = "802bb88cd69dfd1509f6670416bd4434015693ad"
uuid = "a33af91c-f02d-484b-be07-31d278c5ca2b"
version = "0.1.2"
weakdeps = ["InverseFunctions"]

    [deps.CompositionsBase.extensions]
    CompositionsBaseInverseFunctionsExt = "InverseFunctions"

[[deps.ConcurrentUtilities]]
deps = ["Serialization", "Sockets"]
git-tree-sha1 = "21d088c496ea22914fe80906eb5bce65755e5ec8"
uuid = "f0e56b4a-5159-44fe-b623-3e5288b988bb"
version = "2.5.1"

[[deps.ConstructionBase]]
git-tree-sha1 = "b4b092499347b18a015186eae3042f72267106cb"
uuid = "187b0558-2788-49d3-abe0-74a17ed4e7c9"
version = "1.6.0"

    [deps.ConstructionBase.extensions]
    ConstructionBaseIntervalSetsExt = "IntervalSets"
    ConstructionBaseLinearAlgebraExt = "LinearAlgebra"
    ConstructionBaseStaticArraysExt = "StaticArrays"

    [deps.ConstructionBase.weakdeps]
    IntervalSets = "8197267c-284f-5f27-9208-e0e47529a953"
    LinearAlgebra = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
    StaticArrays = "90137ffa-7385-5640-81b9-e52037218182"

[[deps.Crayons]]
git-tree-sha1 = "54b76cbb40d9a0f5368c880725b2f141da77c94f"
uuid = "a8cc5b0e-0ffa-5ad4-8c14-923d3ee1735f"
version = "4.2.0"

[[deps.DataAPI]]
git-tree-sha1 = "abe83f3a2f1b857aac70ef8b269080af17764bbe"
uuid = "9a962f9c-6df0-11e9-0e5d-c546b8b5ee8a"
version = "1.16.0"

[[deps.DataFrames]]
deps = ["Compat", "DataAPI", "DataStructures", "Future", "InlineStrings", "InvertedIndices", "IteratorInterfaceExtensions", "LinearAlgebra", "Markdown", "Missings", "PooledArrays", "PrecompileTools", "PrettyTables", "Printf", "Random", "Reexport", "SentinelArrays", "SortingAlgorithms", "Statistics", "TableTraits", "Tables", "Unicode"]
git-tree-sha1 = "5fab31e2e01e70ad66e3e24c968c264d1cf166d6"
uuid = "a93c6f00-e57d-5684-b7b6-d8193f3e46c0"
version = "1.8.2"

[[deps.DataStructures]]
deps = ["OrderedCollections"]
git-tree-sha1 = "b0bc6d2cad1fed8b7fd59a1551a991cb3d2809e6"
uuid = "864edb3b-99cc-5e75-8d2d-829cb0a9cfe8"
version = "0.19.6"

[[deps.DataValueInterfaces]]
git-tree-sha1 = "bfc1187b79289637fa0ef6d4436ebdfe6905cbd6"
uuid = "e2d170a0-9d28-54be-80f0-106bbe20a464"
version = "1.0.0"

[[deps.Dates]]
deps = ["Printf"]
uuid = "ade2ca70-3891-5945-98fb-dc099432e06a"
version = "1.11.0"

[[deps.DelimitedFiles]]
deps = ["Mmap"]
git-tree-sha1 = "9e2f36d3c96a820c678f2f1f1782582fcf685bae"
uuid = "8bb1440f-4735-579b-a4ab-409b98df4dab"
version = "1.9.1"

[[deps.Dictionaries]]
deps = ["Indexing", "Random", "Serialization"]
git-tree-sha1 = "a55766a9c8f66cf19ffcdbdb1444e249bb4ace33"
uuid = "85a47980-9c8c-11e8-2b9f-f7ca1fa99fb4"
version = "0.4.6"

[[deps.DiffResults]]
deps = ["StaticArraysCore"]
git-tree-sha1 = "782dd5f4561f5d267313f23853baaaa4c52ea621"
uuid = "163ba53b-c6d8-5494-b064-1a9d43ac40c5"
version = "1.1.0"

[[deps.DiffRules]]
deps = ["IrrationalConstants", "LogExpFunctions", "NaNMath", "Random", "SpecialFunctions"]
git-tree-sha1 = "79a2aca180a85c690c58a020d47b426954b590f8"
uuid = "b552c78f-8df3-52c6-915a-8e097449b14b"
version = "1.16.0"

[[deps.Distributed]]
deps = ["Random", "Serialization", "Sockets"]
uuid = "8ba89e20-285c-5b6f-9357-94700520ee1b"
version = "1.11.0"

[[deps.Distributions]]
deps = ["AliasTables", "FillArrays", "LinearAlgebra", "PDMats", "Printf", "QuadGK", "Random", "Roots", "SpecialFunctions", "Statistics", "StatsAPI", "StatsBase", "StatsFuns"]
git-tree-sha1 = "d2facc77c08c1c2bfb1a77c148edd05b3db5410b"
uuid = "31c24e10-a181-5473-b8eb-7969acd0382f"
version = "0.25.130"

    [deps.Distributions.extensions]
    DistributionsChainRulesCoreExt = "ChainRulesCore"
    DistributionsDensityInterfaceExt = "DensityInterface"
    DistributionsSparseConnectivityTracerExt = "SparseConnectivityTracer"
    DistributionsTestExt = "Test"

    [deps.Distributions.weakdeps]
    ChainRulesCore = "d360d2e6-b24c-11e9-a2a3-2a2ae2dbcce4"
    DensityInterface = "b429d917-457f-4dbc-8f4c-0cc954292b1d"
    SparseConnectivityTracer = "9f842d2f-2579-4b1d-911e-f412cf18a3f5"
    Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"

[[deps.DocStringExtensions]]
git-tree-sha1 = "7442a5dfe1ebb773c29cc2962a8980f47221d76c"
uuid = "ffbed154-4ef7-542d-bbb7-c09d3a79fcae"
version = "0.9.5"

[[deps.Downloads]]
deps = ["ArgTools", "FileWatching", "LibCURL", "NetworkOptions"]
uuid = "f43a241f-c20a-4ad4-852c-f6b1247861c6"
version = "1.7.0"

[[deps.EnumX]]
git-tree-sha1 = "c49898e8438c828577f04b92fc9368c388ac783c"
uuid = "4e289a0a-7415-4d19-859d-a7e5c4648b56"
version = "1.0.7"

[[deps.ExprTools]]
git-tree-sha1 = "d2e49e7efd29719d6f28b891b0e0e159daa9d2b4"
uuid = "e2ba6199-217a-4e67-a87a-7c52f15ade04"
version = "0.1.11"

[[deps.FastGaussQuadrature]]
deps = ["LinearAlgebra", "SpecialFunctions", "StaticArrays"]
git-tree-sha1 = "4916117dd032ec5959b7633aedbbac408ca5ddeb"
uuid = "442a2c76-b920-505d-bb47-c5924d526838"
version = "1.3.0"

[[deps.FileWatching]]
uuid = "7b1f6079-737a-58dc-b8bc-7a2ca5c1b5ee"
version = "1.11.0"

[[deps.FillArrays]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "5bad39456d9f0166184fce2248783dd9862645c1"
uuid = "1a297f60-69ca-5386-bcde-b61e274b549b"
version = "1.17.0"
weakdeps = ["PDMats", "SparseArrays", "StaticArrays", "Statistics"]

    [deps.FillArrays.extensions]
    FillArraysPDMatsExt = "PDMats"
    FillArraysSparseArraysExt = "SparseArrays"
    FillArraysStaticArraysExt = "StaticArrays"
    FillArraysStatisticsExt = "Statistics"

[[deps.ForwardDiff]]
deps = ["CommonSubexpressions", "DiffResults", "DiffRules", "LinearAlgebra", "LogExpFunctions", "NaNMath", "Preferences", "Printf", "Random", "SpecialFunctions"]
git-tree-sha1 = "73d5084cae45f9d0857776ad78cf303fec09eb02"
uuid = "f6369f11-7733-5829-9624-2563aa707210"
version = "1.4.3"
weakdeps = ["StaticArrays"]

    [deps.ForwardDiff.extensions]
    ForwardDiffStaticArraysExt = "StaticArrays"

[[deps.Future]]
deps = ["Random"]
uuid = "9fa8497b-333b-5362-9e8d-4d0656e87820"
version = "1.11.0"

[[deps.GLM]]
deps = ["Distributions", "LinearAlgebra", "LogExpFunctions", "Printf", "Reexport", "SparseArrays", "SpecialFunctions", "Statistics", "StatsAPI", "StatsBase", "StatsModels"]
git-tree-sha1 = "c963639ae5b9aab54f543bdc7504f42f59880bec"
uuid = "38e38edf-8417-5370-95a0-9cbb8c7f171a"
version = "1.9.5"

[[deps.Gamma]]
git-tree-sha1 = "86f86b6168a016ed88e4ae4e64577b98c3b59e8e"
uuid = "a0844989-3bd2-4988-8bea-c9407ab0941b"
version = "1.1.0"

[[deps.HypergeometricFunctions]]
deps = ["Gamma", "LinearAlgebra"]
git-tree-sha1 = "31bb6c92405c084617facc1d7ed9eb6c402d061e"
uuid = "34004b35-14d8-5ef3-9330-4cdb6864b03a"
version = "0.3.30"

[[deps.IfElse]]
git-tree-sha1 = "debdd00ffef04665ccbb3e150747a77560e8fad1"
uuid = "615f187c-cbe4-4ef1-ba3b-2fcf58d6d173"
version = "0.1.1"

[[deps.Indexing]]
git-tree-sha1 = "ce1566720fd6b19ff3411404d4b977acd4814f9f"
uuid = "313cdc1a-70c2-5d6a-ae34-0150d3930a38"
version = "1.1.1"

[[deps.InlineStrings]]
git-tree-sha1 = "8f3d257792a522b4601c24a577954b0a8cd7334d"
uuid = "842dd82b-1e85-43dc-bf29-5d0ee9dffc48"
version = "1.4.5"
weakdeps = ["ArrowTypes", "Parsers"]

    [deps.InlineStrings.extensions]
    ArrowTypesExt = "ArrowTypes"
    ParsersExt = "Parsers"

[[deps.InteractiveUtils]]
deps = ["Markdown"]
uuid = "b77e0a4c-d291-57a0-90e8-8db25a27a240"
version = "1.11.0"

[[deps.InverseFunctions]]
git-tree-sha1 = "a779299d77cd080bf77b97535acecd73e1c5e5cb"
uuid = "3587e190-3f89-42d0-90ee-14403ec27112"
version = "0.1.17"

    [deps.InverseFunctions.extensions]
    InverseFunctionsDatesExt = "Dates"
    InverseFunctionsTestExt = "Test"

    [deps.InverseFunctions.weakdeps]
    Dates = "ade2ca70-3891-5945-98fb-dc099432e06a"
    Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"

[[deps.InvertedIndices]]
git-tree-sha1 = "6da3c4316095de0f5ee2ebd875df8721e7e0bdbe"
uuid = "41ab1584-1d38-5bbf-9106-f11c6c58b48f"
version = "1.3.1"

[[deps.IrrationalConstants]]
git-tree-sha1 = "b2d91fe939cae05960e760110b328288867b5758"
uuid = "92d709cd-6900-40b7-9082-c6be49f344b6"
version = "0.2.6"

[[deps.IteratorInterfaceExtensions]]
git-tree-sha1 = "a3f24677c21f5bbe9d2a714f95dcd58337fb2856"
uuid = "82899510-4779-5014-852e-03e436cf321d"
version = "1.0.0"

[[deps.JLLWrappers]]
deps = ["Artifacts", "Preferences"]
git-tree-sha1 = "7204148362dafe5fe6a273f855b8ccbe4df8173e"
uuid = "692b3bcd-3c85-4b1f-b108-f13ce0eb3210"
version = "1.8.0"

[[deps.JSON3]]
deps = ["Dates", "Mmap", "Parsers", "PrecompileTools", "StructTypes", "UUIDs"]
git-tree-sha1 = "411eccfe8aba0814ffa0fdf4860913ed09c34975"
uuid = "0f8b85d8-7281-11e9-16c2-39a750bddbf1"
version = "1.14.3"
weakdeps = ["ArrowTypes"]

    [deps.JSON3.extensions]
    JSON3ArrowExt = ["ArrowTypes"]

[[deps.JuliaSyntaxHighlighting]]
deps = ["StyledStrings"]
uuid = "ac6e5ff7-fb65-4e79-a425-ec3bc9c03011"
version = "1.12.0"

[[deps.LaTeXStrings]]
git-tree-sha1 = "dda21b8cbd6a6c40d9d02a73230f9d70fed6918c"
uuid = "b964fa9f-0449-5b57-a5c2-d3ea65f4040f"
version = "1.4.0"

[[deps.LibCURL]]
deps = ["LibCURL_jll", "MozillaCACerts_jll"]
uuid = "b27032c2-a3e7-50c8-80cd-2d36dbcbfd21"
version = "0.6.4"

[[deps.LibCURL_jll]]
deps = ["Artifacts", "LibSSH2_jll", "Libdl", "OpenSSL_jll", "Zlib_jll", "nghttp2_jll"]
uuid = "deac9b47-8bc7-5906-a0fe-35ac56dc84c0"
version = "8.15.0+0"

[[deps.LibSSH2_jll]]
deps = ["Artifacts", "Libdl", "OpenSSL_jll"]
uuid = "29816b5a-b9ab-546f-933c-edad1886dfa8"
version = "1.11.3+1"

[[deps.Libdl]]
uuid = "8f399da3-3557-5675-b5ff-fb832c97cbdb"
version = "1.11.0"

[[deps.LinearAlgebra]]
deps = ["Libdl", "OpenBLAS_jll", "libblastrampoline_jll"]
uuid = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
version = "1.12.0"

[[deps.LogExpFunctions]]
deps = ["DocStringExtensions", "IrrationalConstants", "LinearAlgebra"]
git-tree-sha1 = "bba2d9aa057d8f126415de240573e86a8f39d2a1"
uuid = "2ab3a3ac-af41-5b50-aa03-7779005ae688"
version = "1.0.1"

    [deps.LogExpFunctions.extensions]
    LogExpFunctionsChainRulesCoreExt = "ChainRulesCore"
    LogExpFunctionsChangesOfVariablesExt = "ChangesOfVariables"
    LogExpFunctionsInverseFunctionsExt = "InverseFunctions"

    [deps.LogExpFunctions.weakdeps]
    ChainRulesCore = "d360d2e6-b24c-11e9-a2a3-2a2ae2dbcce4"
    ChangesOfVariables = "9e997f8a-9a97-42d5-a9f1-ce6bfc15e2c0"
    InverseFunctions = "3587e190-3f89-42d0-90ee-14403ec27112"

[[deps.Lz4_jll]]
deps = ["Artifacts", "JLLWrappers", "Libdl"]
git-tree-sha1 = "191686b1ac1ea9c89fc52e996ad15d1d241d1e33"
uuid = "5ced341a-0733-55b8-9ab6-a4889d929147"
version = "1.10.1+0"

[[deps.MacroTools]]
git-tree-sha1 = "1e0228a030642014fe5cfe68c2c0a818f9e3f522"
uuid = "1914dd2f-81c6-5fcd-8719-6d5c9610ff09"
version = "0.5.16"

[[deps.Markdown]]
deps = ["Base64", "JuliaSyntaxHighlighting", "StyledStrings"]
uuid = "d6f4376e-aef5-505a-96c1-9c027394607a"
version = "1.11.0"

[[deps.Missings]]
deps = ["DataAPI"]
git-tree-sha1 = "ec4f7fbeab05d7747bdf98eb74d130a2a2ed298d"
uuid = "e1d29d7a-bbdc-5cf2-9ac0-f12de2c33e28"
version = "1.2.0"

[[deps.MixedModels]]
deps = ["Arrow", "BSplineKit", "Compat", "DataAPI", "Distributions", "GLM", "IrrationalConstants", "JSON3", "LinearAlgebra", "Markdown", "MixedModelsDatasets", "NLopt", "PooledArrays", "PrecompileTools", "Printf", "ProgressMeter", "Random", "RectangularFullPacked", "RegressionFormulae", "SparseArrays", "StaticArrays", "Statistics", "StatsAPI", "StatsBase", "StatsModels", "StructTypes", "Tables", "TypedTables"]
git-tree-sha1 = "177c0170b8ef60aa1af5ab40019ff717cd0199f3"
uuid = "ff71e718-51f3-5ec2-a782-8ffcbfa3c316"
version = "5.8.0"

    [deps.MixedModels.extensions]
    MixedModelsFiniteDiffExt = ["FiniteDiff"]
    MixedModelsForwardDiffExt = ["ForwardDiff"]
    MixedModelsPRIMAExt = ["PRIMA"]

    [deps.MixedModels.weakdeps]
    FiniteDiff = "6a86dc24-6348-571c-b903-95158fe2bd41"
    ForwardDiff = "f6369f11-7733-5829-9624-2563aa707210"
    PRIMA = "0a7d04aa-8ac2-47b3-b7a7-9dbd6ad661ed"

[[deps.MixedModelsDatasets]]
deps = ["Arrow", "DelimitedFiles", "Downloads", "Markdown", "ProgressMeter", "SHA", "Scratch"]
git-tree-sha1 = "8ee7a2b0d53a810a7045c12f54ed848db4e6c839"
uuid = "7e9fb7ac-9f67-43bf-b2c8-96ba0796cbb6"
version = "0.2.1"

[[deps.Mmap]]
uuid = "a63ad114-7e13-5084-954f-fe012c677804"
version = "1.11.0"

[[deps.Mocking]]
deps = ["Compat", "ExprTools"]
git-tree-sha1 = "2c140d60d7cb82badf06d8783800d0bcd1a7daa2"
uuid = "78c3b35d-d492-501b-9361-3d52fe80e533"
version = "0.8.1"

[[deps.MozillaCACerts_jll]]
uuid = "14a3606d-f60d-562e-9121-12d972cd8159"
version = "2025.11.4"

[[deps.NLopt]]
deps = ["CEnum", "NLopt_jll"]
git-tree-sha1 = "624785b15005a0e0f4e462b27ee745dbe5941863"
uuid = "76087f3c-5699-56af-9a33-bf431cd00edd"
version = "1.2.1"

    [deps.NLopt.extensions]
    NLoptMathOptInterfaceExt = ["MathOptInterface"]

    [deps.NLopt.weakdeps]
    MathOptInterface = "b8f27783-ece8-5eb3-8dc8-9495eed66fee"

[[deps.NLopt_jll]]
deps = ["Artifacts", "JLLWrappers", "Libdl"]
git-tree-sha1 = "afe9c70ead884bf4cbb887f188d2db6d8f09d49c"
uuid = "079eb43e-fd8e-5478-9966-2cf3e3edb778"
version = "2.11.0+0"

[[deps.NaNMath]]
deps = ["OpenLibm_jll"]
git-tree-sha1 = "dbd2e8cd2c1c27f0b584f6661b4309609c5a685e"
uuid = "77ba4419-2d1f-58cd-9bb1-8ffee604a2e3"
version = "1.1.4"

[[deps.NetworkOptions]]
uuid = "ca575930-c2e3-43a9-ace4-1e988b2c1908"
version = "1.3.0"

[[deps.OpenBLAS_jll]]
deps = ["Artifacts", "CompilerSupportLibraries_jll", "Libdl"]
uuid = "4536629a-c528-5b80-bd46-f80d51c5b363"
version = "0.3.29+0"

[[deps.OpenLibm_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "05823500-19ac-5b8b-9628-191a04bc5112"
version = "0.8.7+0"

[[deps.OpenSSL_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "458c3c95-2e84-50aa-8efc-19380b2a3a95"
version = "3.5.4+0"

[[deps.OpenSpecFun_jll]]
deps = ["Artifacts", "CompilerSupportLibraries_jll", "JLLWrappers", "Libdl"]
git-tree-sha1 = "1346c9208249809840c91b26703912dff463d335"
uuid = "efe28fd5-8261-553b-a9e1-b2916fc3738e"
version = "0.5.6+0"

[[deps.OrderedCollections]]
git-tree-sha1 = "05f45c2e0de6259db764adbfd2f1dc6d3f8de13c"
uuid = "bac558e1-5e72-5ebc-8fee-abe8a469f55d"
version = "2.0.1"

[[deps.PDMats]]
deps = ["LinearAlgebra", "SparseArrays", "SuiteSparse"]
git-tree-sha1 = "123266c25174ef6c8d4718920abc206452cf8de6"
uuid = "90014a1f-27ba-587c-ab20-58faa44d9150"
version = "0.11.41"
weakdeps = ["StatsBase"]

    [deps.PDMats.extensions]
    StatsBaseExt = "StatsBase"

[[deps.Parsers]]
deps = ["Dates", "PrecompileTools", "UUIDs"]
git-tree-sha1 = "32a4e09c5f29402573d673901778a0e03b0807b9"
uuid = "69de0a69-1ddd-5017-9359-2bf0b02dc9f0"
version = "2.8.6"

[[deps.PooledArrays]]
deps = ["DataAPI", "Future"]
git-tree-sha1 = "36d8b4b899628fb92c2749eb488d884a926614d3"
uuid = "2dfb63ee-cc39-5dd5-95bd-886bf059d720"
version = "1.4.3"

[[deps.PrecompileTools]]
deps = ["Preferences"]
git-tree-sha1 = "edbeefc7a4889f528644251bdb5fc9ab5348bc2c"
uuid = "aea7be01-6a6a-4083-8856-8a6e6704d82a"
version = "1.3.4"

[[deps.Preferences]]
deps = ["TOML"]
git-tree-sha1 = "8b770b60760d4451834fe79dd483e318eee709c4"
uuid = "21216c6a-2e73-6563-6e65-726566657250"
version = "1.5.2"

[[deps.PrettyTables]]
deps = ["Crayons", "LaTeXStrings", "Markdown", "PrecompileTools", "Printf", "REPL", "Reexport", "StringManipulation", "Tables"]
git-tree-sha1 = "807a56f504aa08838a11e9a0727c3d704f90c44b"
uuid = "08abe8d2-0d0c-5749-adfa-8a2ac140af0d"
version = "3.4.4"

    [deps.PrettyTables.extensions]
    PrettyTablesExcelExt = "XLSX"
    PrettyTablesTypstryExt = "Typstry"

    [deps.PrettyTables.weakdeps]
    Typstry = "f0ed7684-a786-439e-b1e3-3b82803b501e"
    XLSX = "fdbf4ff8-1666-58a4-91e7-1b58723a45e0"

[[deps.Printf]]
deps = ["Unicode"]
uuid = "de0858da-6303-5e67-8744-51eddeeeb8d7"
version = "1.11.0"

[[deps.ProgressMeter]]
deps = ["Distributed", "Printf"]
git-tree-sha1 = "fbb92c6c56b34e1a2c4c36058f68f332bec840e7"
uuid = "92933f4c-e287-5a05-a399-4b506db050ca"
version = "1.11.0"

[[deps.PtrArrays]]
git-tree-sha1 = "4fbbafbc6251b883f4d2705356f3641f3652a7fe"
uuid = "43287f4e-b6f4-7ad1-bb20-aadabca52c3d"
version = "1.4.0"

[[deps.QuadGK]]
deps = ["DataStructures", "LinearAlgebra"]
git-tree-sha1 = "5e8e8b0ab68215d7a2b14b9921a946fee794749e"
uuid = "1fd47b50-473d-5c70-9696-f719f8f3bcdc"
version = "2.11.3"

    [deps.QuadGK.extensions]
    QuadGKEnzymeExt = "Enzyme"

    [deps.QuadGK.weakdeps]
    Enzyme = "7da242da-08ed-463a-9acd-ee780be4f1d9"

[[deps.REPL]]
deps = ["InteractiveUtils", "JuliaSyntaxHighlighting", "Markdown", "Sockets", "StyledStrings", "Unicode"]
uuid = "3fa0cd96-eef1-5676-8a61-b3b8758bbffb"
version = "1.11.0"

[[deps.Random]]
deps = ["SHA"]
uuid = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
version = "1.11.0"

[[deps.RectangularFullPacked]]
deps = ["LinearAlgebra", "libblastrampoline_jll"]
git-tree-sha1 = "0a84ef9c64057956d666659a3b64e92cd1183335"
uuid = "27983f2f-6524-42ba-a408-2b5a31c238e4"
version = "0.2.1"

[[deps.Reexport]]
git-tree-sha1 = "45e428421666073eab6f2da5c9d310d99bb12f9b"
uuid = "189a3867-3050-52da-a836-e630ba90ab69"
version = "1.2.2"

[[deps.RegressionFormulae]]
deps = ["Combinatorics", "StatsModels"]
git-tree-sha1 = "d4dbe1f3f5dc6b3a7732aa9c54927b1a69f684e4"
uuid = "545c379f-4ec2-4339-9aea-38f2fb6a8ba2"
version = "0.1.4"

[[deps.Rmath]]
deps = ["Random", "Rmath_jll"]
git-tree-sha1 = "5b3d50eb374cea306873b371d3f8d3915a018f0b"
uuid = "79098fc4-a85e-5d69-aa6a-4863f24498fa"
version = "0.9.0"

[[deps.Rmath_jll]]
deps = ["Artifacts", "JLLWrappers", "Libdl"]
git-tree-sha1 = "58cdd8fb2201a6267e1db87ff148dd6c1dbd8ad8"
uuid = "f50d1b31-88e8-58de-be2c-1cc44531875f"
version = "0.5.1+0"

[[deps.Roots]]
deps = ["Accessors", "CommonSolve", "Printf"]
git-tree-sha1 = "7fb25a964849d90a0446366cdefca822e0e84900"
uuid = "f2b01f46-fcfa-551c-844a-d8ac1e96c665"
version = "3.0.6"

    [deps.Roots.extensions]
    RootsChainRulesCoreExt = "ChainRulesCore"
    RootsForwardDiffExt = "ForwardDiff"
    RootsIntervalRootFindingExt = "IntervalRootFinding"
    RootsSymPyExt = "SymPy"
    RootsSymPyPythonCallExt = "SymPyPythonCall"
    RootsUnitfulExt = "Unitful"

    [deps.Roots.weakdeps]
    ChainRulesCore = "d360d2e6-b24c-11e9-a2a3-2a2ae2dbcce4"
    ForwardDiff = "f6369f11-7733-5829-9624-2563aa707210"
    IntervalRootFinding = "d2bf35a9-74e0-55ec-b149-d360ff49b807"
    SymPy = "24249f21-da20-56a4-8eb1-6a02cf4ae2e6"
    SymPyPythonCall = "bc8888f7-b21e-4b7c-a06a-5d9c9496438c"
    Unitful = "1986cc42-f94f-5a68-af5c-568840ba703d"

[[deps.SHA]]
uuid = "ea8e919c-243c-51af-8825-aaa63cd721ce"
version = "0.7.0"

[[deps.SciMLPublic]]
git-tree-sha1 = "cf9aaf8b9ed5db993259ea8b24cf2b7ba9bd3b79"
uuid = "431bcebd-1456-4ced-9d72-93c2757fff0b"
version = "1.2.4"

[[deps.Scratch]]
deps = ["Dates"]
git-tree-sha1 = "9b81b8393e50b7d4e6d0a9f14e192294d3b7c109"
uuid = "6c6a2e73-6563-6170-7368-637461726353"
version = "1.3.0"

[[deps.SentinelArrays]]
deps = ["Dates", "Random"]
git-tree-sha1 = "084c47c7c5ce5cfecefa0a98dff69eb3646b5a80"
uuid = "91c51154-3ec4-41a3-a24f-3f23e20d615c"
version = "1.4.10"

[[deps.Serialization]]
uuid = "9e88b42a-f829-5b0c-bbe9-9e923198166b"
version = "1.11.0"

[[deps.ShiftedArrays]]
git-tree-sha1 = "503688b59397b3307443af35cd953a13e8005c16"
uuid = "1277b4bf-5013-50f5-be3d-901d8477a67a"
version = "2.0.0"

[[deps.Sockets]]
uuid = "6462fe0b-24de-5631-8697-dd941f90decc"
version = "1.11.0"

[[deps.SortingAlgorithms]]
deps = ["DataStructures"]
git-tree-sha1 = "13cd91cc9be159e3f4d95b857fa2aa383b53772a"
uuid = "a2af1166-a08f-5f64-846c-94a0d3cef48c"
version = "1.2.3"

[[deps.SparseArrays]]
deps = ["Libdl", "LinearAlgebra", "Random", "Serialization", "SuiteSparse_jll"]
uuid = "2f01184e-e22b-5df5-ae63-d93ebab69eaf"
version = "1.12.0"

[[deps.SpecialFunctions]]
deps = ["IrrationalConstants", "LogExpFunctions", "OpenLibm_jll", "OpenSpecFun_jll"]
git-tree-sha1 = "6547cbdd8ce32efba0d21c5a40fa96d1a3548f9f"
uuid = "276daf66-3868-5448-9aa4-cd146d93841b"
version = "2.8.0"

    [deps.SpecialFunctions.extensions]
    SpecialFunctionsChainRulesCoreExt = "ChainRulesCore"

    [deps.SpecialFunctions.weakdeps]
    ChainRulesCore = "d360d2e6-b24c-11e9-a2a3-2a2ae2dbcce4"

[[deps.SplitApplyCombine]]
deps = ["Dictionaries", "Indexing"]
git-tree-sha1 = "55db78e829cf726162fc4fc1b30d05f92092f3f6"
uuid = "03a91e81-4c3e-53e1-a0a4-9c0c8f19dd66"
version = "1.3.0"

[[deps.Static]]
deps = ["CommonWorldInvalidations", "IfElse", "PrecompileTools", "SciMLPublic"]
git-tree-sha1 = "4abff9ad312e476839c25b9398f619255af9a0e4"
uuid = "aedffcd0-7271-4cad-89d0-dc628f76c6d3"
version = "1.4.5"

[[deps.StaticArrays]]
deps = ["LinearAlgebra", "PrecompileTools", "Random", "StaticArraysCore"]
git-tree-sha1 = "246a8bb2e6667f832eea063c3a56aef96429a3db"
uuid = "90137ffa-7385-5640-81b9-e52037218182"
version = "1.9.18"

    [deps.StaticArrays.extensions]
    StaticArraysChainRulesCoreExt = "ChainRulesCore"
    StaticArraysStatisticsExt = "Statistics"

    [deps.StaticArrays.weakdeps]
    ChainRulesCore = "d360d2e6-b24c-11e9-a2a3-2a2ae2dbcce4"
    Statistics = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"

[[deps.StaticArraysCore]]
git-tree-sha1 = "6ab403037779dae8c514bad259f32a447262455a"
uuid = "1e83bf80-4336-4d27-bf5d-d5a4f845583c"
version = "1.4.4"

[[deps.Statistics]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "ae3bb1eb3bba077cd276bc5cfc337cc65c3075c0"
uuid = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"
version = "1.11.1"
weakdeps = ["SparseArrays"]

    [deps.Statistics.extensions]
    SparseArraysExt = ["SparseArrays"]

[[deps.StatsAPI]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "178ed29fd5b2a2cfc3bd31c13375ae925623ff36"
uuid = "82ae8749-77ed-4fe6-ae5f-f523153014b0"
version = "1.8.0"

[[deps.StatsBase]]
deps = ["AliasTables", "DataAPI", "DataStructures", "IrrationalConstants", "LinearAlgebra", "LogExpFunctions", "Missings", "Printf", "Random", "SortingAlgorithms", "SparseArrays", "Statistics", "StatsAPI"]
git-tree-sha1 = "e4d7a1a0edc20af42689ea6f4f3587a2175d50ee"
uuid = "2913bbd2-ae8a-5f71-8c99-4fb6c76f3a91"
version = "0.34.12"

[[deps.StatsFuns]]
deps = ["HypergeometricFunctions", "IrrationalConstants", "LogExpFunctions", "Reexport", "Rmath", "SpecialFunctions"]
git-tree-sha1 = "91a5737baed20ee31f3faea0e51f57461f6a689e"
uuid = "4c63d2b9-4356-54db-8cca-17b64c39e42c"
version = "2.2.1"

    [deps.StatsFuns.extensions]
    StatsFunsChainRulesCoreExt = "ChainRulesCore"
    StatsFunsInverseFunctionsExt = "InverseFunctions"

    [deps.StatsFuns.weakdeps]
    ChainRulesCore = "d360d2e6-b24c-11e9-a2a3-2a2ae2dbcce4"
    InverseFunctions = "3587e190-3f89-42d0-90ee-14403ec27112"

[[deps.StatsModels]]
deps = ["DataAPI", "DataStructures", "LinearAlgebra", "Printf", "REPL", "ShiftedArrays", "SparseArrays", "StatsAPI", "StatsBase", "StatsFuns", "Tables"]
git-tree-sha1 = "0db41c4e0d9f3fa195395a6401a8290752c9cd3d"
uuid = "3eaba693-59b7-5ba5-a881-562e759f1c8d"
version = "0.7.10"

[[deps.StringManipulation]]
deps = ["PrecompileTools"]
git-tree-sha1 = "8a90c1d77c3277a5d43b83927b3cbe2c70a37484"
uuid = "892a3eda-7b42-436c-8928-eab12a02cf0e"
version = "0.4.7"

[[deps.StringViews]]
git-tree-sha1 = "f2dcb92855b31ad92fe8f079d4f75ac57c93e4b8"
uuid = "354b36f9-a18e-4713-926e-db85100087ba"
version = "1.3.7"

[[deps.StructTypes]]
deps = ["Dates", "UUIDs"]
git-tree-sha1 = "159331b30e94d7b11379037feeb9b690950cace8"
uuid = "856f2bd8-1eba-4b0a-8007-ebc267875bd4"
version = "1.11.0"

[[deps.StyledStrings]]
uuid = "f489334b-da3d-4c2e-b8f0-e476e12c162b"
version = "1.11.0"

[[deps.SuiteSparse]]
deps = ["Libdl", "LinearAlgebra", "Serialization", "SparseArrays"]
uuid = "4607b0f0-06f3-5cda-b6b1-a6196a1729e9"

[[deps.SuiteSparse_jll]]
deps = ["Artifacts", "Libdl", "libblastrampoline_jll"]
uuid = "bea87d4a-7f5b-5778-9afe-8cc45184846c"
version = "7.8.3+2"

[[deps.TOML]]
deps = ["Dates"]
uuid = "fa267f1f-6049-4f14-aa54-33bafae1ed76"
version = "1.0.3"

[[deps.TZJData]]
deps = ["Artifacts"]
git-tree-sha1 = "72df96b3a595b7aab1e101eb07d2a435963a97e2"
uuid = "dc5dba14-91b3-4cab-a142-028a31da12f7"
version = "1.5.0+2025b"

[[deps.TableTraits]]
deps = ["IteratorInterfaceExtensions"]
git-tree-sha1 = "c06b2f539df1c6efa794486abfb6ed2022561a39"
uuid = "3783bdb8-4a98-5b6b-af9a-565f29a5fe9c"
version = "1.0.1"

[[deps.Tables]]
deps = ["DataAPI", "DataValueInterfaces", "IteratorInterfaceExtensions", "OrderedCollections", "TableTraits"]
git-tree-sha1 = "0f38a06c83f0007bbab3cf911262841c9a0f07e0"
uuid = "bd369af6-aec1-5ad0-b16a-f7cc5008161c"
version = "1.13.0"

[[deps.TimeZones]]
deps = ["Artifacts", "Dates", "Downloads", "InlineStrings", "Mocking", "Printf", "Scratch", "TZJData", "Unicode", "p7zip_jll"]
git-tree-sha1 = "d422301b2a1e294e3e4214061e44f338cafe18a2"
uuid = "f269a46b-ccf7-5d73-abea-4c690281aa53"
version = "1.22.2"

    [deps.TimeZones.extensions]
    TimeZonesRecipesBaseExt = "RecipesBase"

    [deps.TimeZones.weakdeps]
    RecipesBase = "3cdcf5f2-1ef4-517c-9805-6587b60abb01"

[[deps.TranscodingStreams]]
git-tree-sha1 = "0c45878dcfdcfa8480052b6ab162cdd138781742"
uuid = "3bb67fe8-82b1-5028-8e26-92a6c54297fa"
version = "0.11.3"

[[deps.TypedTables]]
deps = ["Adapt", "Dictionaries", "Indexing", "SplitApplyCombine", "Tables", "Unicode"]
git-tree-sha1 = "84fd7dadde577e01eb4323b7e7b9cb51c62c60d4"
uuid = "9d95f2ec-7b3d-5a63-8d20-e2491e220bb9"
version = "1.4.6"

[[deps.UUIDs]]
deps = ["Random", "SHA"]
uuid = "cf7118a7-6976-5b1a-9a39-7adc72f591a4"
version = "1.11.0"

[[deps.Unicode]]
uuid = "4ec0a83e-493e-50e2-b9ac-8f72acf5a8f5"
version = "1.11.0"

[[deps.Zlib_jll]]
deps = ["Libdl"]
uuid = "83775a58-1f1d-513f-b197-d71354ab007a"
version = "1.3.1+2"

[[deps.Zstd_jll]]
deps = ["Artifacts", "JLLWrappers", "Libdl"]
git-tree-sha1 = "446b23e73536f84e8037f5dce465e92275f6a308"
uuid = "3161d3a3-bdf6-5164-811a-617609db77b4"
version = "1.5.7+1"

[[deps.libblastrampoline_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "8e850b90-86db-534c-a0d3-1478176c7d93"
version = "5.15.0+0"

[[deps.nghttp2_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "8e850ede-7688-5339-a07c-302acd2aaf8d"
version = "1.64.0+1"

[[deps.p7zip_jll]]
deps = ["Artifacts", "CompilerSupportLibraries_jll", "Libdl"]
uuid = "3f19e933-33d8-53b3-aaab-bd5110c3b7a0"
version = "17.7.0+0"
"""

# ╔═╡ Cell order:
# ╠═5eed1a01-0000-11f1-9a01-000000000001
# ╟─5eed1a02-0000-11f1-9a01-000000000002
# ╟─5eed1a31-0000-11f1-9a01-000000000031
# ╠═5eed1a32-0000-11f1-9a01-000000000032
# ╠═5eed1a33-0000-11f1-9a01-000000000033
# ╠═5eed1a34-0000-11f1-9a01-000000000034
# ╟─5eed1a35-0000-11f1-9a01-000000000035
# ╠═5eed1a36-0000-11f1-9a01-000000000036
# ╠═5eed1a37-0000-11f1-9a01-000000000037
# ╠═5eed1a38-0000-11f1-9a01-000000000038
# ╟─5eed1a03-0000-11f1-9a01-000000000003
# ╠═5eed1a04-0000-11f1-9a01-000000000004
# ╠═5eed1a05-0000-11f1-9a01-000000000005
# ╠═5eed1a06-0000-11f1-9a01-000000000006
# ╟─5eed1a07-0000-11f1-9a01-000000000007
# ╠═5eed1a08-0000-11f1-9a01-000000000008
# ╠═5eed1a09-0000-11f1-9a01-000000000009
# ╟─5eed1a39-0000-11f1-9a01-000000000039
# ╠═5eed1a40-0000-11f1-9a01-000000000040
# ╠═5eed1a41-0000-11f1-9a01-000000000041
# ╠═5eed1a42-0000-11f1-9a01-000000000042
# ╟─5eed1a43-0000-11f1-9a01-000000000043
# ╠═5eed1a44-0000-11f1-9a01-000000000044
# ╠═5eed1a45-0000-11f1-9a01-000000000045
# ╠═5eed1a46-0000-11f1-9a01-000000000046
# ╟─5eed1a47-0000-11f1-9a01-000000000047
# ╠═5eed1a48-0000-11f1-9a01-000000000048
# ╠═5eed1a49-0000-11f1-9a01-000000000049
# ╠═5eed1a50-0000-11f1-9a01-000000000050
# ╟─5eed1a10-0000-11f1-9a01-000000000010
# ╠═5eed1a11-0000-11f1-9a01-000000000011
# ╠═5eed1a12-0000-11f1-9a01-000000000012
# ╠═5eed1a13-0000-11f1-9a01-000000000013
# ╟─5eed1a14-0000-11f1-9a01-000000000014
# ╠═5eed1a15-0000-11f1-9a01-000000000015
# ╠═5eed1a16-0000-11f1-9a01-000000000016
# ╠═5eed1a17-0000-11f1-9a01-000000000017
# ╟─5eed1a18-0000-11f1-9a01-000000000018
# ╟─00000000-0000-0000-0000-000000000001
# ╟─00000000-0000-0000-0000-000000000002
