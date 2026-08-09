### A Pluto.jl notebook ###
# v1.0.3
# Official Pluto references checked 2026-08-09:
# https://plutojl.org/en/docs/packages-advanced/
# https://plutojl.org/en/docs/reactivity/
# https://plutojl.org/en/docs/files-open/

using Markdown
using InteractiveUtils

# ╔═╡ a2f20001-5e8e-4de2-9800-000000000001
begin
    import Pkg
    Pkg.activate(@__DIR__)
    using Distributions, Random, Statistics
    include(joinpath(@__DIR__, "..", "..", "scripts", "p2-likelihood-contracts.jl"))
    using .P2LikelihoodContracts
end

# ╔═╡ a2f20002-5e8e-4de2-9800-000000000002
md"""
# P2研究Notebook: 選ばれた値と選ばれなかった人数を一緒に読む

> **状態: research only / 公開Notebookではありません**

このNotebookは、Normalのselection-count likelihoodを公開教材へ移す前の実行可能な教材試作です。関数が値を返したことを「安全」と読み替えず、**観測契約 → 比較fit → 区間status → 誤指定反例**の順に確認します。

到達目標は次の5点です。

1. `N`、`m`、範囲外人数、未測定人数を分ける
2. 選択後だけのfitと、選別人数を使うfitを同じdataで比べる
3. Wald・profile・parametric bootstrapを自動選択せず並べる
4. `search_limit`と`insufficient_success`を「区間なし」と読む
5. 選択率が合っても、supportとtailが壊れる場合を見つける

!!! warning "このNotebookの範囲"
    固定された有限境界、独立なscreening、正確な総数と選択数、Normal familyだけを扱います。実データ解析用の安定APIではありません。
"""

# ╔═╡ a2f20003-5e8e-4de2-9800-000000000003
md"""
## 1. まず観測契約を監査する

下のNamedTupleは入力フォームの試作です。値を変更すると、後続セルが自動的に再計算されます。`total_screened`へ入れるのは募集人数ではなく、**同じ規則で実際にscreeningできた人数**です。
"""

# ╔═╡ a2f20004-5e8e-4de2-9800-000000000004
screening_contract = (
    total_recruited = 400,
    total_screened = 400,
    selected_count = 43,
    excluded_outside = 357,
    not_screened = 0,
    boundary_precommitted = true,
    same_boundary = true,
    same_population = true,
    independent_rows = true,
    exact_selected_values = true,
    excluded_are_confirmed_outside = true,
)

# ╔═╡ a2f20005-5e8e-4de2-9800-000000000005
function audit_selection_count_contract(contract)
    required = (
        :total_recruited,
        :total_screened,
        :selected_count,
        :excluded_outside,
        :not_screened,
        :boundary_precommitted,
        :same_boundary,
        :same_population,
        :independent_rows,
        :exact_selected_values,
        :excluded_are_confirmed_outside,
    )
    missing_fields = filter(field -> !hasproperty(contract, field), required)
    if !isempty(missing_fields)
        return (
            status = :stop,
            reasons = [:missing_field],
            messages = ["入力欄が不足しています: $(join(string.(missing_fields), ", "))"],
            notes = String[],
        )
    end

    reasons = Symbol[]
    messages = String[]
    notes = String[]
    add_issue(reason, message) = (push!(reasons, reason); push!(messages, message))

    counts = (
        contract.total_recruited,
        contract.total_screened,
        contract.selected_count,
        contract.excluded_outside,
        contract.not_screened,
    )
    if !all(value -> value isa Integer && !(value isa Bool), counts)
        add_issue(:count_type, "人数はBoolではない整数で記録してください。")
    elseif any(<(0), counts)
        add_issue(:negative_count, "人数に負の値は使えません。")
    else
        contract.total_recruited == contract.total_screened + contract.not_screened ||
            add_issue(
                :recruitment_count_mismatch,
                "募集総数はscreening済み人数と未測定人数の和に一致しません。",
            )
        contract.total_screened ==
            contract.selected_count + contract.excluded_outside ||
            add_issue(
                :screening_count_mismatch,
                "Nは選択数mと確認済み範囲外人数の和に一致しません。",
            )
        contract.selected_count >= 2 ||
            add_issue(:too_few_selected, "parameter識別には選択値が2件以上必要です。")
        contract.not_screened > 0 && push!(
            notes,
            "未測定$(contract.not_screened)人は範囲外人数へ混ぜず、N=$(contract.total_screened)からも除いています。",
        )
    end

    contract.boundary_precommitted || add_issue(
        :boundary_posthoc,
        "dataを見た後で決めた境界です。事前固定された選択規則とは別の観測過程です。",
    )
    contract.same_boundary || add_issue(
        :heterogeneous_boundary,
        "施設・時点で境界が異なります。境界ごとのNとmへ分けてください。",
    )
    contract.same_population || add_issue(
        :population_mismatch,
        "同じ解析対象でない人を一つのNへ合算しています。",
    )
    contract.independent_rows || add_issue(
        :dependent_rows,
        "同一人物の反復測定を独立な人数として数えています。依存構造が必要です。",
    )
    contract.exact_selected_values || add_issue(
        :censoring_confusion,
        "選択値が境界値へ置換されています。truncationではなくcensoringを検討します。",
    )
    contract.excluded_are_confirmed_outside || add_issue(
        :missingness_confusion,
        "範囲外と未測定・故障・同意撤回が混ざっています。N-mを範囲外人数として使えません。",
    )

    (
        status = isempty(reasons) ? :ready : :stop,
        reasons,
        messages,
        notes,
    )
end

# ╔═╡ a2f20006-5e8e-4de2-9800-000000000006
contract_audit = audit_selection_count_contract(screening_contract)

# ╔═╡ a2f20007-5e8e-4de2-9800-000000000007
contract_feedback = if contract_audit.status == :ready
    note = isempty(contract_audit.notes) ? "" : "\n\n" * join(contract_audit.notes, "\n\n")
    Markdown.parse("✅ **観測契約はこの研究例の入口を通過しました。** N=400、m=43、範囲外357人を別々に保持します。" * note)
else
    Markdown.parse(
        "⛔ **fitを開始しません。**\n\n" *
        join(["- `$(reason)`: $(message)" for (reason, message) in
              zip(contract_audit.reasons, contract_audit.messages)], "\n"),
    )
end

# ╔═╡ a2f20008-5e8e-4de2-9800-000000000008
begin
    valid_with_unmeasured = merge(screening_contract, (
        total_recruited = 500,
        not_screened = 100,
    ))
    contract_counterexamples = (
        missingness = merge(screening_contract, (
            excluded_are_confirmed_outside = false,
        )),
        posthoc = merge(screening_contract, (
            boundary_precommitted = false,
        )),
        heterogeneous = merge(screening_contract, (
            same_boundary = false,
        )),
        repeated = merge(screening_contract, (
            independent_rows = false,
        )),
        censored = merge(screening_contract, (
            exact_selected_values = false,
        )),
    )
end

# ╔═╡ a2f20009-5e8e-4de2-9800-000000000009
contract_classification = (
    valid_with_unmeasured = audit_selection_count_contract(valid_with_unmeasured),
    examples = map(audit_selection_count_contract, contract_counterexamples),
)

# ╔═╡ a2f20010-5e8e-4de2-9800-000000000010
md"""
未測定100人を`not_screened`として分離し、実際にscreeningできた400人だけを`N`にすれば契約は通ります。一方、次は別々の停止理由です。

- `missingness_confusion`: 範囲外と未測定を混ぜた
- `boundary_posthoc`: dataを見てから境界を決めた
- `heterogeneous_boundary`: 施設や時点で境界が違う
- `dependent_rows`: 同一人物を独立な複数人として数えた
- `censoring_confusion`: 正確な選択値ではなく境界値へ置換した

すべてを「入力エラー」で済ませず、必要な観測モデルがどう変わるかを返します。
"""

# ╔═╡ a2f20011-5e8e-4de2-9800-000000000011
md"""
## 2. 同じ43件を、人数なし／人数ありでfitする

真の潜在分布を`Normal(37, 1.7)`とし、中央10%へ入った値だけを残します。実データでは真値は見えません。このセルは、既知の真値を回復できるか調べるsimulationです。
"""

# ╔═╡ a2f20012-5e8e-4de2-9800-000000000012
begin
    teaching_truth = Normal(37, 1.7)
    teaching_lower, teaching_upper = quantile.(Ref(teaching_truth), (0.45, 0.55))
    teaching_latent = rand(Xoshiro(20271234), teaching_truth, 400)
    teaching_observed = filter(
        value -> teaching_lower < value < teaching_upper,
        teaching_latent,
    )
end

# ╔═╡ a2f20013-5e8e-4de2-9800-000000000013
begin
    conditional_fit = fit_truncated_normal(
        teaching_observed;
        lower = teaching_lower,
        upper = teaching_upper,
    )
    selection_count_fit = fit_selection_count_normal(
        teaching_observed,
        400;
        lower = teaching_lower,
        upper = teaching_upper,
    )
end

# ╔═╡ a2f20014-5e8e-4de2-9800-000000000014
fit_comparison = (
    selected = length(teaching_observed),
    excluded = 400 - length(teaching_observed),
    truth = (mu = mean(teaching_truth), sigma = std(teaching_truth)),
    selected_only = (
        mu = mean(conditional_fit.distribution),
        sigma = std(conditional_fit.distribution),
    ),
    with_selection_count = (
        mu = mean(selection_count_fit.distribution),
        sigma = std(selection_count_fit.distribution),
    ),
)

# ╔═╡ a2f20015-5e8e-4de2-9800-000000000015
md"""
固定seedでは400人中43人が残りました。選択後43件だけの条件付きfitは、ほぼ平らに見える狭い範囲から潜在scaleを決められず、極端な解へ進みます。人数ありfitは「400人中43人」という約10.75%の選択率も使うため、点推定を現実的な範囲へ戻します。

ただし、人数情報を加えたfitでも`sigma`の点推定は真値と一致していません。**点推定の破局的逸脱を防ぐこと**と、**95%区間が校正されること**を分けて次へ進みます。
"""

# ╔═╡ a2f20016-5e8e-4de2-9800-000000000016
md"""
## 3. Wald・profile・bootstrapを一つのreportで読む

bootstrapは選択後の43行だけを再標本化せず、fit済みの潜在Normalから400人全体を再生成して同じscreeningをやり直します。ここでは教材実行時間を抑えるため199反復です。研究APIの既定値は999反復です。
"""

# ╔═╡ a2f20017-5e8e-4de2-9800-000000000017
interval_report = selection_count_interval_report(
    Xoshiro(20279001),
    teaching_observed,
    400;
    lower = teaching_lower,
    upper = teaching_upper,
    bootstrap_repetitions = 199,
)

# ╔═╡ a2f20018-5e8e-4de2-9800-000000000018
begin
    interval_message_ja = Dict(
        :wald_is_local_approximation => "Wald区間は最適値近傍の局所二次近似です。",
        :profile_interval_unresolved => "profile端点を探索範囲内で確定できませんでした。",
        :profile_skipped_weak_identification => "弱識別警告のためprofileを開始しませんでした。",
        :profile_computation_error => "profile計算が例外で終了しました。",
        :bootstrap_success_rate_too_low => "bootstrap有効fit率が事前の最低値へ届きませんでした。",
        :compare_profile_and_bootstrap => "profileとbootstrapを並べ、反復coverageの根拠も確認してください。",
    )

    function japanese_interval_feedback(report)
        label = if report.status == :review_profile_and_bootstrap
            "要比較: 自動採用なし"
        elseif report.status == :unresolved_profile
            "区間なし: profile未解決"
        elseif report.status == :unresolved_bootstrap
            "区間なし: bootstrap未解決"
        else
            "未登録status: $(report.status)"
        end
        (
            status = report.status,
            label,
            automatic_interval = report.automatic_interval,
            profile_status = report.profile.status,
            bootstrap_status = report.bootstrap.status,
            messages = [get(interval_message_ja, code, string(code)) for code in report.messages],
        )
    end
end

# ╔═╡ a2f20019-5e8e-4de2-9800-000000000019
interval_feedback = japanese_interval_feedback(interval_report)

# ╔═╡ a2f20020-5e8e-4de2-9800-000000000020
md"""
`automatic_interval = nothing`は計算漏れではありません。中央10%選択の確認simulationでは、bootstrap fitが100%成功しても`sigma`の95%区間coverageは61.25%または71.25%でした。計算成功率と区間校正は別なので、三方式から都合のよいものを自動選択しません。
"""

# ╔═╡ a2f20021-5e8e-4de2-9800-000000000021
md"""
## 4. 未解決statusを消さない

次は意図的な停止例です。10人しか再生成しないbootstrapでは、選択値が2件未満になりやすく、有効fit率が不足します。profile側は探索回数を0へ制限し、端点未確定を再現します。
"""

# ╔═╡ a2f20022-5e8e-4de2-9800-000000000022
begin
    insufficient_bootstrap = parametric_bootstrap_selection_count_intervals(
        Xoshiro(20281199),
        selection_count_fit,
        10;
        lower = teaching_lower,
        upper = teaching_upper,
        repetitions = 99,
    )
    profile_search_limited = selection_count_interval_report(
        Xoshiro(20281200),
        teaching_observed,
        400;
        lower = teaching_lower,
        upper = teaching_upper,
        bootstrap_repetitions = 99,
        profile_max_expansions = 0,
    )
end

# ╔═╡ a2f20023-5e8e-4de2-9800-000000000023
unresolved_feedback = (
    bootstrap = (
        status = insufficient_bootstrap.status,
        label = "区間なし: bootstrap有効fit率不足",
        success_rate = insufficient_bootstrap.success_rate,
        mu = insufficient_bootstrap.mu,
        sigma = insufficient_bootstrap.sigma,
    ),
    profile = japanese_interval_feedback(profile_search_limited),
)

# ╔═╡ a2f20024-5e8e-4de2-9800-000000000024
md"""
`missing`区間は「差がない」「推定値が0」という意味ではありません。この観測設計、反復数、探索設定では区間を報告できないという結果です。表から行を落とさず、statusと失敗率を保存します。
"""

# ╔═╡ a2f20025-5e8e-4de2-9800-000000000025
md"""
## 5. 選択率が合ってもsupportとtailを点検する

正の値しか取らない`LogNormal(0, 0.8)`から中央10%だけを観測し、Normal専用fitへ誤って渡します。選択率だけならほぼ完全に再現できますが、未観測領域の予測を確認します。
"""

# ╔═╡ a2f20026-5e8e-4de2-9800-000000000026
begin
    misspecified_truth = LogNormal(0, 0.8)
    misspecified_lower, misspecified_upper = quantile.(
        Ref(misspecified_truth),
        (0.45, 0.55),
    )
    misspecified_latent = rand(Xoshiro(20278001), misspecified_truth, 4_000)
    misspecified_observed = filter(
        value -> misspecified_lower < value < misspecified_upper,
        misspecified_latent,
    )
    misspecified_fit = fit_selection_count_normal(
        misspecified_observed,
        4_000;
        lower = misspecified_lower,
        upper = misspecified_upper,
    )
end

# ╔═╡ a2f20027-5e8e-4de2-9800-000000000027
misspecification_diagnostics = let
    fitted = misspecified_fit.distribution
    observed_rate = length(misspecified_observed) / 4_000
    fitted_rate = exp(log_selection_probability(
        fitted,
        misspecified_lower,
        misspecified_upper,
    ))
    (
        selected = length(misspecified_observed),
        observed_selection_rate = observed_rate,
        fitted_selection_rate = fitted_rate,
        selection_rate_gap = abs(fitted_rate - observed_rate),
        probability_below_zero = cdf(fitted, 0.0),
        q95_ratio = quantile(fitted, 0.95) / quantile(misspecified_truth, 0.95),
        status = :family_misspecification_visible,
    )
end

# ╔═╡ a2f20028-5e8e-4de2-9800-000000000028
md"""
この1例では選択率の差はほぼ0ですが、Normal fitは本来存在しない負値へ約17%の確率を置き、95%分位点を真値の半分未満にします。収束flagや選択率一致だけで、潜在分布のfamily、support、tailまで正しいとは判断できません。
"""

# ╔═╡ a2f20029-5e8e-4de2-9800-000000000029
notebook_checks = (
    contract_ready = contract_audit.status == :ready &&
        contract_classification.valid_with_unmeasured.status == :ready,
    feedback_categories = Set(reduce(
        vcat,
        [audit.reasons for audit in values(contract_classification.examples)],
    )) == Set((
        :missingness_confusion,
        :boundary_posthoc,
        :heterogeneous_boundary,
        :dependent_rows,
        :censoring_confusion,
    )),
    comparison_visible = length(teaching_observed) == 43 &&
        abs(fit_comparison.selected_only.mu - mean(teaching_truth)) > 100 &&
        abs(fit_comparison.with_selection_count.mu - mean(teaching_truth)) < 2,
    interval_review_required = interval_report.status == :review_profile_and_bootstrap &&
        interval_report.profile.status == :ok &&
        interval_report.bootstrap.status == :ok &&
        isnothing(interval_report.automatic_interval),
    unresolved_visible = insufficient_bootstrap.status == :insufficient_success &&
        all(ismissing, insufficient_bootstrap.mu) &&
        profile_search_limited.status == :unresolved_profile,
    misspecification_visible = misspecification_diagnostics.selection_rate_gap < 0.001 &&
        misspecification_diagnostics.probability_below_zero > 0.05 &&
        misspecification_diagnostics.q95_ratio < 0.70,
)

# ╔═╡ a2f20030-5e8e-4de2-9800-000000000030
begin
    notebook_pass = all(values(notebook_checks))
    notebook_pass || error("P2研究Notebookの学習契約が崩れました: $notebook_checks")
    notebook_marker = string(
        "P2_SELECTION_COUNT_NOTEBOOK_PASS ",
        "selected=$(length(teaching_observed)) ",
        "interval_status=$(interval_report.status) ",
        "bootstrap_unresolved=$(insufficient_bootstrap.status) ",
        "profile_unresolved=$(profile_search_limited.status) ",
        "misspecification=$(misspecification_diagnostics.status)",
    )
    println(notebook_marker)
    notebook_marker
end

# ╔═╡ a2f20031-5e8e-4de2-9800-000000000031
md"""
## 読み終えたら説明すること

1. 500人募集・100人未測定・400人screeningの場合、なぜ`N=400`なのか
2. 43件だけのfitが極端でも、400人中43人という情報が同定を助ける理由
3. `automatic_interval = nothing`が慎重すぎるのではなく、どの検証結果に基づくか
4. `missing`区間と「効果なし」がなぜ違うか
5. 選択率が合うNormal fitでも、LogNormalの潜在予測へ使えない理由

この5点を説明できても、公開APIへの昇格条件をすべて満たしたわけではありません。次は同じstatus分類をWeb教材の誤答別feedbackへ移し、入力と出力の表現を利用者テストします。
"""

# ╔═╡ Cell order:
# ╠═a2f20001-5e8e-4de2-9800-000000000001
# ╟─a2f20002-5e8e-4de2-9800-000000000002
# ╟─a2f20003-5e8e-4de2-9800-000000000003
# ╠═a2f20004-5e8e-4de2-9800-000000000004
# ╠═a2f20005-5e8e-4de2-9800-000000000005
# ╠═a2f20006-5e8e-4de2-9800-000000000006
# ╠═a2f20007-5e8e-4de2-9800-000000000007
# ╠═a2f20008-5e8e-4de2-9800-000000000008
# ╠═a2f20009-5e8e-4de2-9800-000000000009
# ╟─a2f20010-5e8e-4de2-9800-000000000010
# ╟─a2f20011-5e8e-4de2-9800-000000000011
# ╠═a2f20012-5e8e-4de2-9800-000000000012
# ╠═a2f20013-5e8e-4de2-9800-000000000013
# ╠═a2f20014-5e8e-4de2-9800-000000000014
# ╟─a2f20015-5e8e-4de2-9800-000000000015
# ╟─a2f20016-5e8e-4de2-9800-000000000016
# ╠═a2f20017-5e8e-4de2-9800-000000000017
# ╠═a2f20018-5e8e-4de2-9800-000000000018
# ╠═a2f20019-5e8e-4de2-9800-000000000019
# ╟─a2f20020-5e8e-4de2-9800-000000000020
# ╟─a2f20021-5e8e-4de2-9800-000000000021
# ╠═a2f20022-5e8e-4de2-9800-000000000022
# ╠═a2f20023-5e8e-4de2-9800-000000000023
# ╟─a2f20024-5e8e-4de2-9800-000000000024
# ╟─a2f20025-5e8e-4de2-9800-000000000025
# ╠═a2f20026-5e8e-4de2-9800-000000000026
# ╠═a2f20027-5e8e-4de2-9800-000000000027
# ╟─a2f20028-5e8e-4de2-9800-000000000028
# ╠═a2f20029-5e8e-4de2-9800-000000000029
# ╠═a2f20030-5e8e-4de2-9800-000000000030
# ╟─a2f20031-5e8e-4de2-9800-000000000031
