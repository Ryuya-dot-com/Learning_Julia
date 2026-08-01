// レッスン: デザインの検定力設計
// 掲載値は scripts/power-design-check.jl で固定検証する。
export default {
  id: "power-design",
  title: "デザインの検定力設計",
  tag: "設計原理必須・simulation任意：研究の性能を測る",
  pages: [
    {
      t: "卒業章でも、大規模simulationは任意",
      b: [
        "`必須理解` は、検定力をNだけの属性とせず、生成モデル・解析手順・判定規則を含む設計全体の性能として説明できることです。第I種過誤、MCSE、解析失敗、一般化軸も別々に数えます。",
        "`出力読解` では、単一の80%判定ではなく、効果、参加者数、項目数、信頼性、欠測を動かした感度表を比較します。既存の結果を批判的に読めれば初回の到達目標を満たします。",
        "`任意実装` は、`MixedModels.jl` を反復適合する卒業制作です。計算時間と収束失敗を伴うため、混合モデルのformulaと診断を理解し、環境が準備された後に実行します。本文を読むためにsimulationを走らせる必要はありません。",
      ],
    },
    {
      t: "検定力は標本数の属性ではなく設計全体の性能",
      b: [
        "検定力は、特定の生成モデル、解析パイプライン、判定規則の下で、研究を反復したときに目的の判断へ到達する確率です。Nだけで決まらず、効果、分散、参加者・項目・施設、試行数、測定信頼性、欠測、除外、モデル、検定法に依存します。",
        "この卒業章では、参加者と項目の両方へランダム傾きを持つ仮想研究を生成し、事前登録するLMMで解析します。第I種過誤、検定力、MCSE、特異適合、解析失敗を別々に数えます。",
        "80%は自然法則でも合否線でもありません。見逃し、偽陽性、推定精度、コスト、参加者負担、意思決定損失を踏まえて目標を決め、単一シナリオで80%を超えたことを『保証』と呼びません。",
      ],
    },
    {
      t: "観測後のpowerで結果を説明しない",
      b: [
        "事前の検定力は、まだ観測していない研究の設計を比較する道具です。データ収集後に同じ標本の推定効果を真値として代入したobserved／post-hoc powerは、p値を別表現しただけになりやすく、非有意結果が『検定力不足だった』かを新しく識別しません。",
        "観測後は、効果推定値と信頼区間、事前に定めた最小重要効果との関係、同等性検定や予測性能を報告します。非有意は効果0の証明でも、必ずunderpoweredだった証明でもありません。",
        "設計時の効果値は、単一の先行研究の有意な推定値をそのまま使いません。出版バイアス、winner's curse、対象差を考慮し、最小重要効果・メタ分析・予備研究・専門知から複数シナリオを作ります。",
      ],
    },
    {
      t: "生成モデルへ二つの一般化軸を入れる",
      b: [
        "24人×12項目×2条件を作り、条件を−0.5／+0.5へ中心化します。参加者と項目の切片だけでなく条件傾きも変動させます。項目を固定した試行反復は残差を減らしますが、新しい項目への一般化を支える項目数の代わりにはなりません。",
        "信頼性は、潜在的な試行残差SD50へ追加する測定ノイズとして入れます。reliability=.8なら追加SDは50√(1/.8−1)=25です。この定義は一つの生成モデルであり、実研究では前レッスンの誤差モデルに合わせて変更します。",
      ],
      code: `using MixedModels, DataFrames, Random, Statistics

function crossed_design(n_subj, n_item; missing_rate = 0.0, seed = 1)
    subj = repeat(1:n_subj, inner = 2n_item)
    item = repeat(repeat(1:n_item, inner = 2), outer = n_subj)
    cc = repeat([-0.5, 0.5], outer = n_subj * n_item)
    if missing_rate > 0
        keep = rand(Xoshiro(seed), length(subj)) .>= missing_rate
        subj, item, cc = subj[keep], item[keep], cc[keep]
    end
    return (; subj, item, condition_centered = cc)
end

function simulate_response(rng, d, n_subj, n_item;
        effect = 20.0, subj_slope_sd = 25.0, item_slope_sd = 15.0,
        residual_sd = 50.0, reliability = 0.8)
    u0, u1 = 60 .* randn(rng, n_subj), subj_slope_sd .* randn(rng, n_subj)
    v0, v1 = 30 .* randn(rng, n_item), item_slope_sd .* randn(rng, n_item)
    measurement_sd = residual_sd * sqrt(1 / reliability - 1)
    cc = d.condition_centered
    return 500 .+ effect .* cc .+ u0[d.subj] .+ u1[d.subj] .* cc .+
        v0[d.item] .+ v1[d.item] .* cc .+
        residual_sd .* randn(rng, length(cc)) .+
        measurement_sd .* randn(rng, length(cc))
end`,
      a: [
        "関数の引数は、研究計画で動かす量と、先行情報から仮定する量を可視化します。コード内の固定値60、30、50も本来は根拠と感度範囲を記録するパラメータです。",
        "欠測maskはシナリオごとに固定したMCARの観測予定表です。結果や未観測値に依存するMAR／MNAR、参加者単位の脱落、条件別除外は別の欠測関数として生成する必要があります。",
      ],
    },
    {
      t: "解析モデルと判定規則を計画どおり再現する",
      b: [
        "一つの仮想データを、実研究で使う完全な式で適合します。参加者・項目のランダム切片と条件傾きを入れ、ここでは相関パラメータを0とするzerocorr構造を事前に選びます。生成モデルと解析モデルが同じことは基準シナリオであって、現実の保証ではありません。",
      ],
      code: `rng_design = Xoshiro(3601)
design = crossed_design(24, 12)
y = simulate_response(rng_design, design, 24, 12)
df = DataFrame(subj = string.("S", design.subj),
    item = string.("I", design.item),
    condition_centered = design.condition_centered, y = y)

m = fit(MixedModel,
    @formula(y ~ 1 + condition_centered +
                 zerocorr(1 + condition_centered | subj) +
                 zerocorr(1 + condition_centered | item)),
    df; progress = false)
rejected = abs(coef(m)[2] / stderror(m)[2]) > 1.96`,
      a: [
        "|z|>1.96はMixedModels.jlの漸近Wald近似を使う両側5%判定です。少数の参加者・項目、境界分散、GLMMの疎なセルでは5%に校正されない可能性があるため、後で効果0のsimulationを行います。",
        "本番で尤度比検定、bootstrap、事前コントラスト、欠測処理、外れ値除外を使うなら、その手順を判定関数へ丸ごと入れます。簡単なz判定で設計し、収集後だけ複雑な選択を加えると性能が一致しません。",
      ],
    },
    {
      t: "同じmodel objectをrefitして研究を反復する",
      b: [
        "固定したデザイン行列では、毎回式を解析し直さずrefit!へ新しい反応を渡せます。各反復で効果推定・SE・特異性を取得し、拒否、解析失敗、singularを別々に数えます。完全版は検証スクリプトに置き、ここでは中核ループを示します。",
      ],
      code: `function wilson_interval(hits, n)
    z, p = 1.959963984540054, hits / n
    denominator = 1 + z^2 / n
    center = (p + z^2 / (2n)) / denominator
    half = z * sqrt(p * (1 - p) / n + z^2 / (4n^2)) / denominator
    return (center - half, center + half)
end

function power_lmm(; n_subj = 24, n_item = 12, effect = 20.0,
        subj_slope_sd = 25.0, item_slope_sd = 15.0,
        reliability = 0.8, missing_rate = 0.0,
        nsim = 200, seed = 3601)
    design = crossed_design(n_subj, n_item; missing_rate,
                            seed = seed + 10_000)
    rng = Xoshiro(seed)
    first_y = simulate_response(rng, design, n_subj, n_item;
        effect, subj_slope_sd, item_slope_sd, reliability)
    df = DataFrame(subj = string.("S", design.subj),
        item = string.("I", design.item),
        condition_centered = design.condition_centered, y = first_y)
    model = fit(MixedModel,
        @formula(y ~ 1 + condition_centered +
                     zerocorr(1 + condition_centered | subj) +
                     zerocorr(1 + condition_centered | item)),
        df; progress = false)

    hits = analyzed = singular = regular_hits = regular_analyzed = 0
    for simulation in 1:nsim
        y = simulation == 1 ? first_y :
            simulate_response(rng, design, n_subj, n_item;
                effect, subj_slope_sd, item_slope_sd, reliability)
        try
            refit!(model, y; progress = false)
            analyzed += 1
            rejected = abs(coef(model)[2] / stderror(model)[2]) > 1.96
            hits += rejected
            is_singular = MixedModels.issingular(model)
            singular += is_singular
            if !is_singular
                regular_analyzed += 1
                regular_hits += rejected
            end
        catch
            # 解析不能も計画の性能として別に数える
        end
    end
    power = analyzed == 0 ? NaN : hits / analyzed
    lower, upper = analyzed == 0 ? (NaN, NaN) : wilson_interval(hits, analyzed)
    mcse = analyzed == 0 ? NaN : sqrt(power * (1 - power) / analyzed)
    return (; power, mcse,
        lower, upper, analyzed, failure_rate = 1 - analyzed / nsim,
        singular_rate = analyzed == 0 ? NaN : singular / analyzed,
        regular_power = regular_analyzed == 0 ? NaN : regular_hits / regular_analyzed,
        retained_rows = length(design.subj))
end`,
      a: [
        "try/catchで失敗を消して終わりにはしません。failure_rateを必ず返し、どのデータ構成で失敗したかをログへ残します。解析不能を除いたconditional powerと、失敗を含めた研究成功確率は異なります。",
        "並列化するときも各worker・シナリオに独立なRNG streamを渡し、グローバルRandom.seed!へ戻しません。同じseedは再現性を与えますが、仮定の正しさや十分な反復数は保証しません。",
      ],
    },
    {
      t: "基準値にはMCSEと区間を付ける",
      b: [
        "検証用の200反復では、基準デザインの検定力は0.710です。MCSEは√(p(1−p)/nsim)=0.032、二項比率のWilson 95%区間は0.644–0.768です。これは研究結果のCIではなく、有限回simulationによる数値誤差です。",
      ],
      code: `baseline = power_lmm(n_subj = 24, n_item = 12, effect = 20,
                     nsim = 200, seed = 3601)
println((power = round(baseline.power, digits = 3),
         mcse = round(baseline.mcse, digits = 3),
         interval = round.([baseline.lower, baseline.upper], digits = 3),
         failure = round(baseline.failure_rate, digits = 3),
         singular = round(baseline.singular_rate, digits = 3)))`,
      out: `(power = 0.71, mcse = 0.032, interval = [0.644, 0.768], failure = 0.0, singular = 0.16)`,
      a: [
        "200回で得た71.0%は±数ポイント揺れます。80%に届いたかを小数点以下まで比較する精度はありません。候補を粗く探索するときは少数反復、最終候補では十分な反復へ増やします。",
        "区間にはWilson法を使いました。p±1.96×MCSEの正規近似も大標本では近いですが、0や1に近い比率・少数反復では範囲外や過度に楽観的な区間になりえます。",
      ],
    },
    {
      t: "必要反復数を数値精度から逆算する",
      b: [
        "検定力pをtarget_mcseの精度で推定する近似必要数はp(1−p)/target_mcse²です。検定力80%付近を0.5ポイントのMCSEで測るには約6400回、p不明の最悪ケース0.5なら1万回です。",
      ],
      code: `required_nsim(power, target_mcse) =
    ceil(Int, power * (1 - power) / target_mcse^2)
println((at_power_80_half_point = required_nsim(0.8, 0.005),
         worst_case_half_point = required_nsim(0.5, 0.005)))`,
      out: `(at_power_80_half_point = 6400, worst_case_half_point = 10000)`,
      a: [
        "反復数は1000という慣習で決めず、必要な数値精度と計算費用から決めます。複数シナリオの順位だけを見る探索段階と、計画書へ載せる最終推定を分けると効率的です。",
        "乱数によるMCSEを小さくしても、効果量や分散成分の仮定誤差は減りません。simulation回数を増やすことと、仮定範囲を広げることは別の仕事です。",
      ],
    },
    {
      t: "効果0で第I種過誤を校正する",
      b: [
        "effect=0で同じ生成・解析・判定を回すと、検出率は検定力ではなく第I種過誤率です。300反復で0.047、MCSE0.012、Wilson区間0.028–0.077となり、5%と整合しました。",
      ],
      code: `null_result = power_lmm(effect = 0.0, nsim = 300, seed = 3602)
println((type1 = round(null_result.power, digits = 3),
         mcse = round(null_result.mcse, digits = 3),
         interval = round.([null_result.lower, null_result.upper], digits = 3)))`,
      out: `(type1 = 0.047, mcse = 0.012, interval = [0.028, 0.077])`,
      a: [
        "この結果はz規則が普遍的に正しい証明ではありません。水準数、分散境界、欠測、応答分布を変えたシナリオでも校正します。300回では区間が広いため、最終校正には反復を増やします。",
        "検出率が高くても第I種過誤が10%なら、5%検定としての高検定力とは呼べません。検定力と偽陽性率を対で評価し、必要なら判定閾値または推論法を変更します。",
      ],
    },
    {
      t: "同じ行数でも参加者と項目は交換できない",
      b: [
        "48人×12項目と24人×24項目は、どちらも2条件込みで1152行です。参加者条件傾きSD25、項目条件傾きSD15の生成世界では、参加者倍増が0.870、項目倍増が0.820でした。",
      ],
      code: `more_subjects = power_lmm(n_subj = 48, n_item = 12, seed = 3603)
more_items = power_lmm(n_subj = 24, n_item = 24, seed = 3604)
println((more_subjects = round(more_subjects.power, digits = 3),
         more_items = round(more_items.power, digits = 3),
         rows_each = more_subjects.retained_rows))`,
      out: `(more_subjects = 0.87, more_items = 0.82, rows_each = 1152)`,
      a: [
        "条件効果の参加者差が項目差より大きいため、この仮定では参加者がやや有利です。分散成分や費用を変えれば順位も変わります。『総行数』や『総試行数』だけで設計を比較しません。",
        "同じ項目を繰り返すtrial、異なる項目を増やすitem、新しい参加者を増やすsubjectは、残差、項目母集団、参加者母集団という別の不確かさを減らします。一般化したい軸へ水準を追加します。",
      ],
    },
    {
      t: "ランダム傾きを楽観的に固定しない",
      b: [
        "基準の参加者傾きSD25・項目傾きSD15を、45・30へ上げると検定力は0.345へ下がりました。切片SDを大きくすることと、条件効果のばらつきを大きくすることは同じではありません。",
      ],
      code: `heterogeneous = power_lmm(subj_slope_sd = 45,
    item_slope_sd = 30, seed = 3605)
println((baseline = round(baseline.power, digits = 3),
         heterogeneous = round(heterogeneous.power, digits = 3)))`,
      out: `(baseline = 0.71, heterogeneous = 0.345)`,
      a: [
        "ランダム切片だけのpilotや集約データから傾き分散を0と置くと、試行追加の価値を過大評価しやすくなります。先行研究の区間、複数データセット、専門的に妥当な上限を感度軸へ置きます。",
        "ランダム傾き分散の推定自体が不安定なら、一点推定を真値に固定しません。小・中・大の分散シナリオ、または分散成分のbootstrap／事後分布から生成します。",
      ],
    },
    {
      t: "測定信頼性を設計変数に戻す",
      b: [
        "基準の信頼性0.8を0.5へ下げると検定力は0.660となりました。測定ノイズは残差を増やし、同じ参加者・項目数でも条件効果のSEを広げます。",
      ],
      code: `low_reliability = power_lmm(reliability = 0.5, seed = 3606)
println((reliability_08 = round(baseline.power, digits = 3),
         reliability_05 = round(low_reliability.power, digits = 3)))`,
      out: `(reliability_08 = 0.71, reliability_05 = 0.66)`,
      a: [
        "信頼性を上げる費用と参加者を増やす費用を同じsimulationで比較できます。ただし、項目追加でαを上げること、装置誤差を減らすこと、別methodを加えることは異なる誤差源を変えます。",
        "説明変数誤差、二値誤分類、群別DIFなら、残差SDを増やすだけでは不十分です。前レッスンで書いた測定モデルを生成過程へ移植します。",
      ],
    },
    {
      t: "欠測率だけでなく欠測機構を動かす",
      b: [
        "行をMCARで20%落とした固定予定表では、576行が456行となり、検定力は0.635でした。これは欠測が効果・反応・参加者差と独立という限定的な反例です。",
      ],
      code: `missing_rows = power_lmm(missing_rate = 0.2, seed = 3607)
println((complete = round(baseline.power, digits = 3),
         missing_20pct = round(missing_rows.power, digits = 3),
         retained_rows = missing_rows.retained_rows))`,
      out: `(complete = 0.71, missing_20pct = 0.635, retained_rows = 456)`,
      a: [
        "参加者単位の脱落は参加者水準数を減らし、項目除外は項目一般化を狭めます。同じ20%でもランダムな試行欠測とは影響が違います。欠測単位と時点を分けて生成します。",
        "結果が悪いほど脱落する、特定条件で機器が失敗する、除外閾値が反応時間に依存する場合、バイアスと検定力を同時に評価します。完全データの真値を知るsimulationだからこそ、被覆率も確認できます。",
      ],
    },
    {
      t: "一つの効果値で計画を保証しない",
      b: [
        "効果20msの基準0.710に対し、10msなら0.270でした。最小重要効果、保守的効果、期待効果を並べ、どの範囲なら設計が有用かを示します。",
      ],
      code: `small_effect = power_lmm(effect = 10, seed = 3608)
println((effect_20 = round(baseline.power, digits = 3),
         effect_10 = round(small_effect.power, digits = 3)))`,
      out: `(effect_20 = 0.71, effect_10 = 0.27)`,
      a: [
        "各効果値へ条件づける通常の検定力と、効果・分散の不確実性分布から毎回値を引くassurance／expected powerを区別します。後者は事前分布の妥当性に依存し、悪い仮定を平均して消す方法ではありません。",
        "効果0を含むシナリオ分布で成功確率を求める場合、科学的に意味のある成功条件も定義します。有意であれば成功、ではなく、方向・最小効果・精度・安全性を組み合わせることがあります。",
      ],
    },
    {
      t: "singularと解析失敗も研究性能に含める",
      b: [
        "基準では最適化失敗0%でしたが、singular fitが16%ありました。全適合を数えた検定力0.710に対し、非singularだけの条件付き検出率は0.679です。どちらか一つを都合よく採用しません。",
      ],
      code: `println((all_fits = round(baseline.power, digits = 3),
         singular_rate = round(baseline.singular_rate, digits = 3),
         regular_only = round(baseline.regular_power, digits = 3),
         failure_rate = round(baseline.failure_rate, digits = 3)))`,
      out: `(all_fits = 0.71, singular_rate = 0.16, regular_only = 0.679, failure_rate = 0.0)`,
      a: [
        "singularは必ず誤った研究ではなく、分散が境界に近い情報です。しかし、その後にモデルを簡略化するなら、簡略化規則と再検定をsimulation内へ入れ、第I種過誤も再校正します。",
        "収束した反復だけを分母にすると、難しいデータを除いたconditional performanceになります。研究成功確率では解析不能を失敗として数える値、失敗率、条件付き性能を併記します。",
      ],
    },
    {
      t: "前処理・モデル選択・多重性をループ内へ入れる",
      b: [
        "実研究で行う品質管理、試行除外、外れ値処理、変換、欠測処理、参照水準、共変量調整、モデル比較、下位検定、多重性補正を、仮想研究ごとに同じ順序で実行します。きれいな生成データへ最終モデルだけ当てても、分析者の自由度は評価できません。",
        "複数アウトカム・時点・群・コントラストのうち一つでも有意なら成功とするなら、familywise第I種過誤を校正します。主要評価項目と主要コントラストを事前に定め、探索的結果は別に評価します。",
        "データを見てランダム構造、変換、共変量を選ぶアルゴリズムを使うなら、その選択を全反復で再現します。一つの選択済みモデルへ固定した検定力は、選択不確かさを無視します。",
      ],
    },
    {
      t: "逐次・適応デザインは停止規則まで生成する",
      b: [
        "途中でp<.05なら停止し、そうでなければ参加者を追加する方法を固定標本の5%判定で繰り返すと、第I種過誤が増えます。中間解析時点、停止境界、最大N、無益性停止をdecision ruleとしてsimulationへ入れます。",
        "内部pilotで分散だけを再推定するsample-size re-estimation、群割付を変える適応デザイン、Bayesian stoppingも、使う情報と意思決定規則を事前に定めます。適応した後の推定バイアスと区間被覆も検証します。",
        "simulationは悪い停止規則を正当化する装置ではありません。帰無と対立の双方で誤り、期待標本数、最大負担、停止理由を比較し、必要な方法論的補正を使います。",
      ],
    },
    {
      t: "費用・精度・一般化のPareto面を探す",
      b: [
        "候補デザインを参加者数×項目数×試行数×信頼性のgridとして作り、検定力だけでなく、バイアス、RMSE、区間被覆、平均区間幅、失敗率、singular率、費用、参加者負担を一行ずつ保存します。",
        "ある候補より費用が高く、全性能が悪い候補は支配されています。残ったPareto候補から、参加者募集、刺激作成、測定改善の現実的制約を踏まえて選びます。最小Nを一つ探すより判断過程が監査できます。",
        "高検定力でも推定値が大きく偏る、区間被覆が悪い、項目母集団へ一般化できない設計は良い設計ではありません。検定力を推定品質と科学的範囲の一指標へ戻します。",
      ],
    },
    {
      t: "再現可能な設計報告を残す",
      b: [
        "報告には、推定対象、完全な生成式、効果と全分散成分の根拠・範囲、測定誤差、欠測機構、候補デザイン、完全な解析式、判定規則、第I種過誤、検定力、MCSE／区間、バイアス・被覆、失敗・singular率、反復数、RNG、Julia・package版、Project.toml／Manifest.toml、コードを含めます。",
        "『1000回simulationし80%だった』だけでは再現できません。どの母集団へ、何を成功とし、どの誤差・除外・選択を含めたかが必要です。表には基準だけでなく、結論が変わる悲観シナリオも載せます。",
        "MixedModels.parametricbootstrapは適合済みモデルからの不確かさ評価に有用ですが、参加者・項目数や欠測・測定モデルを変える前向き設計の全てを自動化する関数ではありません。目的に応じて生成器を明示します。",
      ],
    },
    {
      t: "卒業制作は自分の生成モデルを説明すること",
      b: [
        "最終成果物は一つのNではなく、研究質問→推定対象→サンプリング軸→測定モデル→欠測・除外→解析→判定→性能指標が一続きになった実行可能な設計書です。仮定が変われば結論がどこで変わるかを説明できれば、simulationを研究判断へ使えています。",
        "実データ収集後は、設計時の仮定と観測された分散・欠測・singular率を比較し、次研究の事前分布とsimulationを更新します。ただし、現在のp値を都合よく説明するpost-hoc powerへ戻りません。",
        "これで番号付き37本の本編は完走です。次の発展は、ベイズ階層モデル、SEM／IRT、因果推論、適応デザイン、再現可能な研究パイプラインです。Juliaの強みは速さだけでなく、統計的な生成過程を一つの検査可能なプログラムとして表現できる点にあります。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "検定力0.71、MCSE0.032というsimulation結果の最も適切な解釈はどれですか？",
      opts: [
        "仮定した生成・解析・判定の下で約71%であり、simulation自体にも数ポイントの数値誤差がある",
        "現実の研究で検出確率が正確に71.000%と保証された",
        "非有意結果が得られたら効果0と証明できる",
      ],
      ans: 0,
      why: "検定力は仮定つきの確率で、有限反復によるMCSEもあります。仮定誤差はMCSEとは別に感度分析します。",
      hint: "MCSEが何の不確かさを表すかを考えます。",
    },
    {
      k: "fill",
      q: "検定力推定値powerと反復数nsimからMCSEを計算します。空欄〔?〕に入る関数名を入力しましょう。",
      code: `mcse = 〔?〕(power * (1 - power) / nsim)`,
      accept: ["sqrt"],
      show: "sqrt",
      why: "二項比率のMonte Carlo標準誤差は√(p(1−p)/nsim)です。研究データのSEとは主語が違います。",
      hint: "分散を標準偏差へ戻す平方根の関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "デザインsimulationについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "総観測行数が同じなら、参加者数と項目数の配分を変えても検定力は必ず同じになる",
          a: false,
          why: "参加者と項目は異なる一般化軸で、各ランダム傾き分散により性能が変わります。1152行でも0.870と0.820でした。",
        },
        {
          s: "効果0のsimulationは、予定した判定規則の第I種過誤を校正するために使える",
          a: true,
          why: "帰無生成時の棄却率が名目5%に整合するかを確認し、高い検出率が偽陽性増加によるものではないか調べます。",
        },
        {
          s: "一つの楽観的シナリオで80%を超えれば、欠測や測定誤差を検討する必要はない",
          a: false,
          why: "効果、傾き分散、信頼性、欠測などの妥当な範囲で感度分析し、悲観条件でも研究目的を満たすかを確認します。",
        },
      ],
      hint: "一般化軸、帰無校正、仮定感度の三点を分けます。",
    },
    {
      k: "choice",
      q: "200回中16%がsingular fitだった検定力simulationで、最も監査可能な報告はどれですか？",
      opts: [
        "全反復の性能、singular率、非singular条件付き性能、解析失敗率を分けて示す",
        "singular反復を黙って削除し、残りだけを検定力とする",
        "最適化が停止したのでsingular診断は不要とする",
      ],
      ans: 0,
      why: "singularや解析不能の扱いで推定対象が変わるため、全体・条件付き性能と発生率を分けて報告します。",
      hint: "難しい仮想研究を除外すると、どの条件付き確率になるかを考えます。",
    },
    {
      k: "choice",
      q: "データ収集後に同じ標本の推定効果を使ってobserved powerを計算する代わりに、何を中心に報告しますか？",
      opts: [
        "効果推定値と区間、最小重要効果との関係、事前に定めた推論",
        "p値から逆算したobserved powerだけ",
        "有意なら100%、非有意なら0%という検定力",
      ],
      ans: 0,
      why: "post-hoc powerは同じデータのp値を再表現しがちです。観測後は効果と不確かさを直接評価します。",
      hint: "設計前の問いと、データ観測後の問いを分けます。",
    },
  ],
};
