# Stan modelの実行

`bernoulli.stan`は、成功数から成功確率を推定する最小modelです。入力契約は次の2値です。

- `N`: 全試行数
- `successes`: 成功数。`0 <= successes <= N`

StanSample 7.10.3はprojectの依存へ固定済みです。CmdStanとC++ toolchainを要するため、通常の`code/run_analysis.jl`と`code/run_r_bridge.jl`からは独立させています。

```sh
julia --project=. code/setup_cmdstan.jl
julia --project=. code/run_stan_bridge.jl
```

setupはCmdStan 2.39.0の公式archiveだけを使い、releaseのSHA-256と展開後のdirectory構成を一時領域で確認してからproject内の`.cmdstan/`へ移し、最終pathでbuildします。別の導入済みCmdStanを使う場合は、`CMDSTAN`または`JULIA_CMDSTAN_HOME`を`run_stan_bridge.jl`の起動前に指定できます。

2026-09-05にmacOS arm64とLinux arm64（Debian 12 container）で配布archiveを新規展開し、CmdStan未導入の状態からdownload・build、R／Stan成果物の生成、同一入力での再利用まで確認済みです。GitHub ActionsのLinux x86_64とWindows x86_64でも新規runner上でJulia環境を用意し、CmdStanのdownload・buildからR／Stanの生成・再利用まで確認しました。Windowsの確認環境はWindows Server 2025、Julia 1.12.7、R 4.5.3、RTools45、CmdStan 2.39.0です。

実行条件はseed 20260904、4 chain、各chainでwarmup 250・sampling 500、NUTSです。Beta(1, 1) priorと成功数5／全6試行から得る解析的な事後分布Beta(6, 2)に対し、theta平均0.75と事後予測成功数の平均4.5をStan drawsで照合します。

`output/stan/<run ID>/`へchain別draws CSV、入力JSON、実行log、model複製、実行file、summary、diagnose結果を保存します。`metadata/runs/stan-bridge--<run ID>.toml`には実行コマンド、入力、設定、driver・Project・ManifestのSHA-256、CmdStan・StanSample・compilerの版、R̂、MCSE、bulk／tail ESS、divergence、treedepth到達数、解析解との誤差、全成果物のpathとSHA-256を残します。process成功後でも、sampling診断または解析解との照合が基準を外れた場合は停止します。

再利用時には成果物hashだけでなく、run ID、入力・code・環境・sampling設定を現在の条件と照合します。theta要約、事後予測平均、divergence、treedepth到達数はchain CSVから、R̂・MCSE・ESSはsummary CSVから再計算・再読込し、記録値と一致しない場合は停止します。

compile、sampling、診断の途中で失敗した場合は、`output/stan/<run ID>/failure.toml`へ例外とstacktraceを記録し、利用できる実行logと途中成果物を残します。同じrun IDでは上書きしません。原因を確認したら、失敗directoryを調査用に移動するか、不要と判断した場合だけ削除して再実行します。`output/`はversion管理の対象外ですが、logとstacktraceにはlocal pathが含まれ得るため、そのまま公開しないでください。
