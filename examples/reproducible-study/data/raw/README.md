# private raw data

実在する参加者・顧客・患者などの機微データは、このdirectoryへ置きます。`data/raw/*`は最初から`.gitignore`の対象で、このREADMEだけを配置規約としてversion管理します。

- 配布用の合成例は`../example/trials_synthetic.csv`です。
- 実データを置いたら`metadata/study.toml`の`input_path`を変更します。
- `input_classification`も研究組織の分類規則に合わせて変更します。
- `git check-ignore -v data/raw/<file>`と`git ls-files data/raw`で、実データが追跡されないことを確認します。
- `.gitignore`は、すでに追跡されたfileを履歴から消しません。誤って追加した場合は共有を止め、研究責任者・情報管理担当者と漏えい対応を行ってください。
