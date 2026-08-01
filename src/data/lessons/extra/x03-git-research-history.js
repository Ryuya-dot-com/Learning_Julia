// 補講: Gitで研究履歴と公開境界を管理する
// Git 2.53でignore・追跡対象・branch・annotated tagを一時repository上で検証。
export default {
  id: "git-research-history",
  title: "Gitで研究履歴と公開境界を管理する",
  tag: "commit・branch・tagと機微dataを分ける",
  pages: [
    {
      t: "Gitは監査可能な履歴であり、privacy装置ではない",
      b: [
        "Gitは、誰がどのcode・schema・文書を、どの変更単位で残したかを追跡します。過去の判断へ戻り、差分をreviewし、同じcommitから分析を再実行する土台になります。単なるbackupより強いのは、変更の理由と順序をcommitとして読める点です。",
        "一方、Gitへ記録した機微dataは履歴へ残り得ます。fileを最新状態から削除した、repositoryをprivateにした、名前を匿名風にした、という事実だけでは漏えい対策になりません。何をGitの外へ置くかを、最初のcommitより前に決めます。",
        "この補講では、公開可能な合成例、localだけのraw data、再生成できる成果物を分離し、commit・branch・tag・releaseの各境界を監査します。Gitはdata access管理や同意、匿名化、backupの代用品ではありません。",
      ],
    },
    {
      t: "working tree・staging area・commitを分けて見る",
      b: [
        "編集しただけの変更はworking treeにあります。`git add`で次のcommit候補をstaging areaへ選び、`git commit`で履歴へ固定します。`git status --short`は対象の一覧、`git diff`は未stageの差分、`git diff --staged`は次に記録される差分です。",
        "研究projectでは、commit直前にstage済み差分を読む習慣が重要です。無関係な探索結果、local設定、別の仮説のcodeが混ざれば、後から一つの変更理由として解釈できません。",
      ],
      code: `git status --short
git diff

git add code/run_analysis.jl metadata/schema.toml
git diff --staged
git commit -m "Validate trial schema before analysis"`,
      lang: "ターミナル",
    },
    {
      t: "commitはfile単位ではなく、検証可能な意味の単位にする",
      b: [
        "よいcommitは『何を変え、なぜ同時に変える必要があったか』を説明できます。たとえば新しい除外規則なら、実装code、schema、対応するtest、説明文を同じcommitへ入れます。巨大な『最終版』commitでは、どの変更が結論を変えたか追跡できません。",
        "逆に、常に1 fileずつcommitすればよいわけでもありません。Project.tomlだけを更新してManifest.tomlを忘れる、formulaだけを変えて結果契約を変えない、といった分断も再現性を損ないます。意味のある変更と、その検証を一緒に残します。",
        "commit messageは結果の良し悪しではなく操作を記述します。`Make significant`より`Add preregistered condition × time contrast`のほうが、将来の自分とreviewerが差分を評価できます。",
      ],
    },
    {
      t: "package更新はbranchで隔離し、数値差まで比較する",
      b: [
        "package更新は単なる保守ではなく、推定値、既定値、警告、乱数列、描画を変え得る分析変更です。専用branchでProject／Manifestを一緒に更新し、clean runと数値回帰testを通してから統合します。",
        "branchは安全性を自動保証しませんが、現在の検証済み状態と更新実験を分けます。差分にはdependency fileだけでなく、主要推定値、除外数、収束状態、図表の変化を添えます。",
      ],
      code: `git switch -c env-update-2026-08

# Pkgによる更新後、Project.tomlとManifest.tomlを同時に確認する
git diff -- Project.toml Manifest.toml
julia --project=validation scripts/run-numeric-checks.jl

git add Project.toml Manifest.toml
git commit -m "Update validated Julia environment"`,
      lang: "ターミナル",
      a: [
        "初心者は最初から複雑なbranch運用を覚える必要はありません。『環境更新だけは分析変更と分ける』という一つの規則から始めれば十分です。",
      ],
    },
    {
      t: ".gitignoreが守るのは、意図的に未追跡のfileだけ",
      b: [
        "`.gitignore`は、Gitが未追跡fileを候補として扱わないための規則です。すでに追跡されているfileへ後から規則を足しても、そのfileの追跡も過去のcommitも消えません。ignoreは削除、暗号化、access制御ではありません。",
        "`git check-ignore -v`は、どのignore規則がpathに一致したかを表示します。`git ls-files`はGitが追跡しているpathを表示します。両方を見ることで、『見えないから安全』という思い込みを避けます。",
      ],
      code: `git check-ignore -v data/raw/participants.csv
git ls-files data/raw
git status --short`,
      lang: "ターミナル",
      a: [
        "templateでは`data/raw/*`をignoreし、配置規約の`data/raw/README.md`だけを例外として追跡します。実データ名が`git ls-files`へ出たら、共有・pushする前に止まります。",
      ],
    },
    {
      t: "公開例とprivate rawは、名前ではなく経路で分ける",
      b: [
        "追跡する合成例を`data/example/trials_synthetic.csv`へ置き、実データは`data/raw/`へ置きます。合成例を実データで上書きすると、そのpathはすでに追跡対象なので危険です。別pathを使う設計がhuman errorを減らします。",
        "`metadata/study.toml`で実行対象の相対pathと情報分類を明示します。入口scriptは絶対pathとproject外への`..`を拒否します。ただし`input_classification`という文字列を書いただけで権限が設定されるわけではありません。保管場所、暗号化、access権、利用契約は別に実装します。",
      ],
      code: `# metadata/study.toml: 配布時の安全な初期値
[study]
id = "synthetic-rt-demo"
input_path = "data/example/trials_synthetic.csv"
input_classification = "synthetic-public"

# 実研究ではdata/raw内の別fileを選び、分類も更新する
# input_path = "data/raw/trials_private.csv"`,
      lang: "TOML",
    },
    {
      t: "機微情報を記録したら、削除操作より先に被害を止める",
      b: [
        "credentialやtokenを記録した場合は、まず失効・rotationし、それ以上使われない状態にします。個人データなら共有を止め、研究責任者、情報管理・倫理・法務など組織の手順に従って連絡し、影響範囲を評価します。『履歴を書き換えれば無事故』とは扱いません。",
        "履歴書換えはcommit IDを変え、共同研究者のclone、fork、cache、release、LFS objectにコピーが残る可能性があります。force pushや履歴書換えを初心者が単独で行う手順としては掲載しません。担当者と対象・通知・再clone・再混入防止まで調整するincident responseです。",
        "共有前なら、追跡を止める操作とignore設定を検討できますが、過去に共有した履歴から消えたことにはなりません。credentialの失効、data breach評価、履歴修復は別々の課題です。",
      ],
    },
    {
      t: "checksumとmetadataも、公開可能とは限らない",
      b: [
        "checksumは内容そのものではありませんが、特定fileとの一致を照合できるfingerprintです。希少なdataset名、参加者数、除外理由、local path、実行者名、時刻を組み合わせると、研究や個人を推測できる場合があります。",
        "そのためrun metadataもpublic版とprivate監査版を分けます。公開版には合成例や公開datasetのchecksum、code・environment version、集約した品質指標を残し、機微入力のpath・checksum・詳細logはaccess制御された場所へ置く判断があり得ます。",
        "『再現性のため全部公開』と『privacyのため何も記録しない』の二択ではありません。再実行に必要なprovenanceを記録しつつ、誰がどのmetadataへaccessできるかを設計します。",
      ],
    },
    {
      t: "Git LFSは大容量fileの置き場所を変えるが、匿名化しない",
      b: [
        "Git LFSは、repositoryにはOIDとsizeなどを持つ小さなpointer fileを置き、実体をremote storageへ保存します。大きな画像や許可されたdatasetをversion管理する用途には役立ちます。",
        "しかしLFSはprivacy分類、匿名化、暗号化方針、同意、access承認の代用品ではありません。LFSで追跡しただけで機微dataを公開repositoryへ置けるようにはなりません。既存の過去履歴も、追跡規則を加えただけでは自動変換されません。",
        "初心者向け本編では導入せず、『容量の問題』と『公開可否の問題』を分けて判断できることを到達点にします。必要な研究室だけが、組織の保管規程と共同研究者の導入手順を確認して採用します。",
      ],
    },
    {
      t: "annotated tagは検証済みcommitへ名前を付ける",
      b: [
        "分析版を論文、preprint、報告書へ対応づけるときはannotated tagを使えます。tagger、日時、messageを持つtag objectになり、『どの検証済みcommitをanalysis-v1.0と呼んだか』を固定できます。",
        "tagが固定するのはcommitです。Git外のprivate data、外部API、OS、乱数、container、Stan toolchainまで自動保存するわけではありません。報告書にはtagに加えてdata versionまたは取得記録、Project／Manifest、入口command、主要な実行metadataを対応づけます。",
      ],
      code: `git tag -a analysis-v1.0 -m "Validated analysis for manuscript draft"
git show analysis-v1.0 --stat`,
      lang: "ターミナル",
    },
    {
      t: "clean cloneでは、手元にしかない前提が露出する",
      b: [
        "自分の長期利用directoryには、未追跡file、global設定、過去の生成物、REPL stateが残ります。別directoryへのclean cloneまたは配布archiveの展開から始めると、commitされていないcode、絶対path、手作業、未記録dependencyを発見できます。",
        "private rawはcloneされないのが正しいため、取得・復号・配置の手順を別の安全なchannelで再現できる必要があります。再現testがdataをGitへ入れるよう要求するなら、test設計が公開境界を壊しています。CIには合成・匿名化済みfixtureを使います。",
      ],
      code: `git clone <repository> audit-copy
cd audit-copy

julia --project=. -e "using Pkg; Pkg.instantiate()"
julia --project=. code/run_analysis.jl
git status --short`,
      lang: "ターミナル",
      a: [
        "`<repository>`は自分のURLへ置き換えるplaceholderです。教材のdownload版はGitを使わずarchive展開から同じclean runを試せます。",
      ],
    },
    {
      t: "releaseは除外listではなく、公開allowlistから組み立てる",
      b: [
        "repository全体をcopyしてから『秘密らしいfileだけ除く』方式は、未知のbackup、log、raw、editor一時fileを見落とします。公開物は、README、code、Project／Manifest、schema、公開合成例など、公開すると決めたpathのallowlistから新しいdirectoryへ組み立てます。",
        "この教材のarchive生成scriptは12 fileを明示し、`data/raw/`からはREADMEだけを含めます。CIはsourceとarchiveのfile一覧・checksumを比較し、さらに一時Git repositoryでprivate raw、`.env`、derived、output、run metadataが追跡されないことを検査します。",
        "ただしallowlistも内容reviewを不要にしません。code内のtoken、READMEへ貼ったlocal path、合成例に混入した実record、画像metadataなどを、機械検査と人のreviewの両方で確認します。",
      ],
    },
    {
      t: "共同研究では責任とrelease手順を先に合意する",
      b: [
        "誰がrawへaccessできるか、誰がschema変更をapproveするか、package更新を誰がreviewするか、tagを誰が打つか、公開archiveを誰が最終確認するかを決めます。全員が全dataへaccessする必要はありません。",
        "pull requestやcode reviewでは、推定値だけでなく入力契約、参照水準、除外規則、乱数seed、警告、privacy境界の差分を見ます。機微な結果を公開CI logへ出さないことも確認します。",
        "長期的には、研究終了後の保管期限、repositoryの管理者交代、remote service停止、暗号鍵、data利用契約の終了も計画します。Git historyが読めても、10年後に環境とdataへ適法に到達できなければ再現経路は切れます。",
      ],
    },
    {
      t: "配布templateで、公開前の停止条件を練習する",
      b: [
        "download版には`.gitignore`、`.gitattributes`、公開合成例、private rawのREADME、`study.toml`、実行入口が含まれます。まず合成例のまま実行し、次にdummy fileを`data/raw/`へ置いてignoreを確認します。実在する機微dataで練習しないでください。",
        "公開前の停止条件は、予期しないtracked file、stage差分の未review、schema未検証、clean run失敗、主要結果の説明不能な変化、機微metadataの混入、tagと報告書の不一致です。一つでもあればreleaseしません。",
      ],
      code: `tar -xf reproducible-study-template.tar
cd reproducible-study

git init
git status --short
git check-ignore -v data/raw/dummy-private.csv`,
      lang: "ターミナル",
      download: {
        path: "templates/reproducible-study-template.tar",
        label: "公開境界つき研究project templateをdownload (.tar)",
      },
      a: [
        "最後のcheckはdummy fileを作った後に実行します。実行可能性の検証は補講『再現可能な研究プロジェクト』、履歴・公開境界の検証はこの補講が担当します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "次のcommitへschema変更と対応するtestだけを入れたいとき、最も監査しやすい手順はどれですか？",
      opts: [
        "対象fileを明示してstageし、git diff --stagedを読んでからcommitする",
        "directory内の全fileを無条件にstageし、差分を見ずcommitする",
        "結果CSVだけをcommitし、codeは手元に残す",
      ],
      ans: 0,
      why: "次に記録する意味のある変更単位を選び、stage済み差分をreviewします。",
      hint: "working treeとstaging areaを分けて考えます。",
    },
    {
      k: "fill",
      q: "次のcommitへ入るstage済み差分を表示します。空欄を入力してください。",
      code: `git diff 〔?〕`,
      accept: ["--staged", "--cached"],
      show: "--staged",
      why: "`git diff --staged`はindexと直前commitの差分を表示します。`--cached`も同じ用途で使えます。",
      hint: "未stageの差分を表示するgit diffとは区別します。",
      placeholder: "option",
    },
    {
      k: "tf",
      q: "Gitと公開境界について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "追跡済みの機微fileへ後から.gitignore規則を足せば、過去の履歴からも消える",
          a: false,
          why: ".gitignoreは意図的に未追跡のfileを扱う規則で、既存の追跡や履歴を消しません。",
        },
        {
          s: "annotated tagだけで、Git外のprivate dataと外部環境まで完全に再現できる",
          a: false,
          why: "tagはcommitを指します。data取得記録、環境、実行metadataなども対応づけます。",
        },
        {
          s: "Git LFSは大容量fileをpointer化するが、匿名化や公開許可の代用品ではない",
          a: true,
          why: "容量の扱いとprivacy・access判断は別の問題です。",
        },
      ],
      hint: "ignore、tag、LFSが実際に管理する対象を限定して考えます。",
    },
    {
      k: "choice",
      q: "公開repositoryへAPI tokenをcommitしてpushしたことに気づきました。最初の対応として最も適切なのはどれですか？",
      opts: [
        "tokenを失効・rotationし共有を止め、担当者と影響範囲・履歴修復を調整する",
        "最新commitからfile名だけ変えれば完了とする",
        "同じtokenを別の.envへ移し、何も通知しない",
      ],
      ans: 0,
      why: "credentialを無効化して被害拡大を止めます。履歴修復はcloneやcacheも含む協調作業です。",
      hint: "履歴から見えにくくする前に、秘密としての効力を止めます。",
    },
    {
      k: "choice",
      q: "Julia package更新を研究分析へ反映する進め方として最も適切なのはどれですか？",
      opts: [
        "別branchでProject／Manifestを一緒に更新し、clean runと主要数値差を検証する",
        "分析途中のbranchでManifestだけを手編集し、testを省略する",
        "最新版という理由だけで全警告と推定値差を受け入れる",
      ],
      ans: 0,
      why: "環境更新を分析変更として隔離し、依存graphと結論への影響を同時に検証します。",
      hint: "version番号ではなく、更新前後の実行契約を見ます。",
    },
    {
      k: "choice",
      q: "公開archiveの組み立て方として、漏えい耐性が最も高いのはどれですか？",
      opts: [
        "公開を承認したpathのallowlistから新規に組み立て、内容と一覧をCI・人の両方でreviewする",
        "repository全体をcopyし、名前にsecretと付くfileだけ除外する",
        "private repositoryなら内容確認なしで全fileを公開archiveへ入れる",
      ],
      ans: 0,
      why: "denylistは未知のraw・log・backupを見落とします。allowlistにも内容reviewを重ねます。",
      hint: "公開対象を積極的に列挙します。",
    },
  ],
};
