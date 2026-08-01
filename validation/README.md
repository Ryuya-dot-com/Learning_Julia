# Julia validation environment

教材コードの数値回帰とPluto smoke test専用の環境です。アプリ本体や配布Notebookの埋め込み環境とは分離します。

```sh
julia --project=validation scripts/setup-validation-env.jl
julia --project=validation scripts/run-numeric-checks.jl
julia --project=validation scripts/run-notebook-smoke.jl
```

- `run-numeric-checks.jl`: 16本の数値検証。GitHub Pages公開前の必須ゲート。
- `run-notebook-smoke.jl`: NB1–NB5の未回答状態をPlutoで実行。重いため変更時・定期実行。
- `nb-exec-check.jl NOTEBOOK ANSWERS`: ローカルの非公開模範解答を差し込み、全✅まで確認する完全検証。

`Project.toml` のcompatは現在実測済みのminor系列に制限し、`Manifest.toml` で解決結果を固定しています。更新時は数値検証とNotebook検証を両方実行してください。
