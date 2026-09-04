// R・Stan連携4: JuliaからStanを呼ぶ
// 事実確認(2026-09-05): Stan.jl stable docs / CmdStan User's Guide 2.39。macOS arm64・Linux arm64・Linux x86_64・Windows x86_64でCmdStan buildとbridgeを実走確認。
export default {
  id: "julia-to-stan",
  title: "StanSampleでStanを呼ぶ",
  tag: "model・data・draws・診断を一組で残す",
  pages: [
    {
      t: "Stanは別の推定engineである",
      b: [
        "Stanは確率modelを記述し、推定するための言語と計算系です。Juliaの関数をStanへ渡して実行するのではなく、modelをStan言語で書き、dataを決めた形式で渡し、CmdStanがcompileした実行fileからdrawsを受け取ります。",
        "StanSample.jlはJuliaからCmdStanを操作するinterfaceです。Julia側はdata準備、実行設定、結果の読込と診断を担当し、sampling自体は外部のCmdStanが担当します。",
      ],
    },
    {
      t: "必須環境が多いので任意発展にする",
      b: [
        "この演習にはJulia packageのStanSampleだけでなく、CmdStanとC++ toolchainが必要です。Stan.jlのstable文書では、StanSample v6はCmdStan 2.35.0以上を必要とします。環境構築に時間がかかるため、本編修了の条件にはしません。",
        "CMDSTANまたはJULIA_CMDSTAN_HOMEへCmdStan directoryを設定してからStanSampleを読み込みます。使用するStanSampleとCmdStanの組合せは、実行時の公式文書で再確認します。",
        "配布templateではStanSample 7.10.3とCmdStan 2.39.0を固定し、公式archiveのSHA-256照合、一時directoryでの安全な展開、project内build、4 chainのsampling、stansummaryとdiagnoseまでを二つのscriptで実行できます。macOS arm64とLinux arm64での新規導入に加え、GitHub ActionsのLinux x86_64とWindows x86_64でもCmdStanの新規buildからR／Stan成果物の生成・再利用まで確認済みです。",
      ],
      code: `pkg> activate path/to/stan-analysis
pkg> add StanSample

julia> ENV["CMDSTAN"] = "/absolute/path/to/cmdstan"
julia> using StanSample

# 配布templateの初回準備と実行
$ julia --project=. code/setup_cmdstan.jl
$ julia --project=. code/run_stan_bridge.jl`,
    },
    {
      t: "modelとdataの名前・型・次元を一致させる",
      b: [
        "Stanのdata blockは入力契約です。JuliaのDictに同名の値がなければ実行できません。整数制約、Vector長、matrix次元も一致させます。境界で自動補正せず、Julia側で検査してから渡します。",
        "次の最小例は、N個の0／1観測から成功確率thetaを推定します。model文字列、data、seed、chain数を別々の変数として残します。",
      ],
      code: `bernoulli_model = raw"""
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

stan_data = Dict(
    "N" => 10,
    "y" => [0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
)

@assert stan_data["N"] == length(stan_data["y"])
@assert all(in((0, 1)), stan_data["y"])`,
    },
    {
      t: "compileとsamplingを分けて読む",
      b: [
        "`SampleModel`はStan codeからsampling用modelを作ります。初回またはmodel変更後にはC++ compileが走ります。`stan_sample`はdataと設定を渡してsamplingを実行します。code変更によるcompile時間と、sampling時間を混同しません。",
        "返された状態を`success`で確認してからdrawsを読みます。失敗したrunの古いCSVや、前回のmodel objectを新しい結果として扱わないよう、runごとに出力先を分けます。",
      ],
      code: `using StanSample

sm = SampleModel("bernoulli_bridge", bernoulli_model)
rc = stan_sample(sm;
    data = stan_data,
    seed = 20260904,
    num_chains = 4,
)

success(rc) || error("Stan sampling failed: $rc")
draws = read_samples(sm, :dataframe)`,
    },
    {
      t: "成功終了と収束診断を分ける",
      b: [
        "processが成功終了しても、事後分布を十分に探索できたとは限りません。R̂、bulk／tail ESS、MCSE、divergent transition、maximum treedepth、energy診断を確認します。閾値を一個通っただけで合格にせず、parameterごとの状態と推定目的への影響を調べます。",
        "divergenceを消すためだけにadapt_deltaを上げる前に、modelのparameterization、尺度、prior、識別可能性を見直します。警告を削除することではなく、samplingが難しいmodel構造を理解することが診断の目的です。",
      ],
    },
    {
      t: "事後予測をmodelの中に用意する",
      b: [
        "generated quantitiesで複製データや関心のある差を生成すると、drawごとの不確かさを保ったまま予測診断へ進めます。推定したparameterの平均だけをJuliaへ戻して予測を作ると、parameter不確かさを落としやすくなります。",
        "観測と同じ標本サイズ・測定限界・欠測機構を持つ複製を作り、平均だけでなく分散、裾、0の数、群差など研究上重要な統計量を比較します。",
        "配布例ではBeta(1, 1) prior、N = 6、成功数5なので、事後分布は解析的にBeta(6, 2)、thetaの平均は0.75です。Stan drawsの平均とこの値を照合し、successes_repの平均も解析値4.5と比べます。解析解は実装の検算に使い、R̂やESSなどのsampling診断は別に確認します。",
      ],
      code: `analytic_theta_mean = (1 + successes) / (2 + N) # 0.75
analytic_rep_mean = N * analytic_theta_mean       # 4.5`,
    },
    {
      t: "生のdraws CSVを保存する",
      b: [
        "CmdStanの標準出力はCSVで、chainごとのmetadataとdrawsを含みます。解析用に整形した表とは別に、chain別draws CSVを保存します。後から別のinterfaceや一般的な表処理でも読み直せます。",
        "保存対象はmodel.stan、入力JSONまたはRDump、初期値、seed、chain ID、warmup・sampling設定、chain別CSV、summary、診断、CmdStan・StanSample・compiler・OSの版です。完全な再現では計算環境まで必要になるため、containerや実行環境の記録も検討します。",
      ],
    },
    {
      t: "Stanへ移す理由を記録する",
      b: [
        "Juliaですでに検証済みのmodelを、流行や速度への期待だけでStanへ書き直す必要はありません。Stanを使う理由は、必要な尤度、階層構造、prior、診断、共同研究の標準手順など、研究上の必要性として記録します。",
        "二つの実装を残す場合は、小さな合成dataで推定対象、log density、代表的な要約が一致するか確認します。差が出たら、parameterization、prior、link、欠測、定数項のどこが違うかを調べます。",
      ],
    },
    {
      t: "外部engineの失敗を途中結果で埋めない",
      b: [
        "compile失敗、初期化失敗、非有限log probability、sampling警告を、欠損係数や前回値へ置き換えて先へ進めません。終了状態とstderrを保存し、そのrunを未解決として扱います。",
        "modelが失敗した理由を調べるときは、data contract、support、初期値、prior、parameterization、計算資源の順に最小例へ戻ります。成功率だけでなく、どの条件で失敗したかを残します。",
        "配布例は失敗したrunの途中成果物、実行log、例外、stacktraceを同じ出力directoryへ残し、そのdirectoryがある間は同じrun IDを上書きしません。logには利用者名を含むlocal pathが現れることがあるため、公開前に内容を確認します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "StanSample.jlがsampling時に呼び出す外部engineはどれでしょう?",
      opts: ["CmdStan", "RCall", "DataFrames"],
      ans: 0,
      why: "StanSampleはJulia側のinterfaceで、modelをcompileしてsamplingする外部engineはCmdStanです。",
      hint: "環境変数CMDSTANで場所を指定するものです。",
    },
    {
      k: "fill",
      q: "samplingの終了状態を確認する関数を答えましょう。",
      code: "〔?〕(rc) || error(\"Stan sampling failed\")",
      accept: ["success", "stansample.success"],
      show: "success",
      why: "`success(rc)`を確認してからdrawsを読みます。process失敗と収束診断は別に扱います。",
      hint: "成功したかを英語で表す関数です。",
      placeholder: "関数名",
    },
    {
      k: "choice",
      q: "CmdStanの結果として優先して保存するものはどれでしょう?",
      opts: ["chain別の生draws CSVと実行設定", "係数平均を写した画像だけ", "最後に表示した一行だけ"],
      ans: 0,
      why: "生drawsと設定があれば、要約や診断を再計算できます。最終表だけではchainの状態を再確認できません。",
      hint: "後からR̂やESSを再計算できるものを選びます。",
    },
    {
      k: "tf",
      q: "Stanの実行と診断について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "processが成功終了すれば、収束診断も自動的に合格である",
          a: false,
          why: "実行成功後にもR̂、ESS、MCSE、divergence、treedepthなどを確認します。",
        },
        {
          s: "data blockの名前・型・次元は、Juliaから渡すdataと一致させる",
          a: true,
          why: "data blockは入力契約です。不足や型・次元の不一致は入口で止めます。",
        },
        {
          s: "generated quantitiesで複製データを作ると、parameter不確かさを保った予測診断へ進める",
          a: true,
          why: "drawごとに複製を作り、観測と同じ統計量を比較できます。",
        },
      ],
      hint: "実行、入力契約、事後予測の三点を分けて考えましょう。",
    },
    {
      k: "choice",
      q: "Juliaで足りる解析をStanへ移す判断として適切なのはどれでしょう?",
      opts: ["必要な尤度・階層構造・診断など研究上の理由を記録する", "新しい道具なので必ず移す", "両方の結果が違っても速い方を採用する"],
      ans: 0,
      why: "外部engineを増やす費用に見合う研究上の必要性を示し、二実装がある場合は合成dataで差を検証します。",
      hint: "道具ではなく、推定したい対象と検証可能性から判断します。",
    },
    {
      k: "choice",
      q: "解析解のある小さなmodelをStanでも実行する主な利点はどれでしょう?",
      opts: ["model・data受け渡し・draw読込の実装を検算できる", "R̂を確認しなくてよくなる", "実データの測定妥当性が保証される"],
      ans: 0,
      why: "既知の事後分布と照合すれば実装経路を検算できますが、sampling診断や研究設計の評価は別に必要です。",
      hint: "解析解が保証する範囲を考えます。",
    },
  ],
};
