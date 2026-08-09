# P2 selection-count learner usability protocol

状態: **protocol ready / no participant sessions completed / research only**

参加者への共有URL: <https://ryuya-dot-com.github.io/Learning_Julia/validation/p2-likelihood/ui-preview.html>

これは検索非掲載・教材catalog非掲載の静的研究previewであり、合成fixtureだけを配布する。公開計算API、入力保存、analytics、session replayは配備しない。

## 1. このgateで答える問い

このroundは、推定法の統計的妥当性を再検証するsimulationではない。初学者が研究用Web UIを使った後に、次を自分の言葉で説明し、誤った入力や未解決結果で停止できるかを調べる。

1. `N`、`m`、`N-m`を区別できるか
2. 範囲外と確認できた人と、未測定・故障・同意撤回を混ぜないか
3. 選択後だけの条件付きfitとselection-count fitの情報差を説明できるか
4. `search_limit`や`insufficient_success`を0幅区間や自動fallbackとして読まないか
5. 選択率が合ってもfamilyのsupport・tailが壊れうると説明できるか

UIの公開可否ではなく、どの文言・順序・feedbackを修正すべきかを決めるformative researchである。[GOV.UKのmoderated usability testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing)にならい、課題は明確な目標を持たせる一方、正解や操作手順を文中で示さない。

## 2. 完了を装わない境界

- この文書、schema、合成example、検証scriptが通っても、利用者テストを実施したことにはならない。
- `P2_LEARNER_USABILITY_PROTOCOL_CHECK_PASS`はprotocolの構造と事前固定条件だけを表す。
- 実参加者の観察が0件の間は、roadmapを`research`から変更しない。
- 小人数roundは母集団の理解率や教育効果を推定するsurvey・実験ではない。
- accessibilityは自動testか少数参加者のどちらか一方で保証しない。W3Cの[accessibility evaluation overview](https://www.w3.org/WAI/test-evaluate/)と[involving users guidance](https://www.w3.org/WAI/test-evaluate/involving-users/)に従い、WCAG確認と多様な実利用者の評価を併用する。

## 3. Round設計

### 3.1 practice

研究者またはteam member 1人でdiscussion guide、local preview、時計、観察票を通す。これは参加者数へ含めない。task文が答えを示す、fixtureが起動しない、観察者間でrubricが一致しない場合は本roundを開始しない。

### 3.2 formative round

- 4〜8人の実際または想定される学習者
- 1 session 30〜45分、同日に詰め込みすぎずsession間に記録時間を置く
- 結果にかかわらず公開昇格判定には使わず、問題発見と改訂に使う
- 改訂内容とissue codeを固定してから次roundへ進む

### 3.3 confirmation round

- formative roundと重複しない4〜8人
- 2 round合計8人以上の完了が必要
- formativeで変更した文言・順序・feedbackを、同じtask IDとrubricで再評価する
- `confirmation_candidate`はこのroundでだけ選べる。それでも他の統計・運用blockerを解除しない

GOV.UKの[research planning guidance](https://www.gov.uk/service-manual/user-research/plan-user-research-for-your-service)は、usability testingを通常4〜8人程度の小roundで反復し、各roundの結果から次を調整する考え方を示している。この人数を統計的十分性の主張には使わない。

## 4. 対象者とaccess needs

対象は、公開済みの「確率変数と確率分布」「観測境界・依存・混合分布」を終えたか、同程度の概念を学習中で、selection-count likelihoodを専門的に学んでいない人とする。Julia熟練者だけに偏らせない。

各roundで利用端末、入力方法、拡大、読み上げ等の必要な調整を事前に確認する。ただし診断名や健康情報は観察JSONへ記録しない。可能ならkeyboard-only利用者を少なくとも1 session含め、別roundでscreen reader、拡大、touch等の実利用者を含める。1人の経験を同じaccess needを持つ全員へ一般化しない。W3Cの[involving users in projects](https://www.w3.org/WAI/planning/involving-users/)が示すように、利用者の多様性と標準適合を両方扱う。

## 5. 導入script

facilitatorは次を読み上げ、同意確認を別の承認済み記録へ残す。署名、氏名、連絡先は観察JSONへ入れない。

> 今日はあなたではなく教材をテストします。分かりにくい点は教材側の改善材料です。途中で休憩または中止でき、不利益はありません。画面は合成データだけを使い、あなた自身のデータは入力しません。考えていることを話せる範囲で教えてください。私から正解は示しませんが、操作不能なら記録して次へ進みます。

録音・録画はこのprotocolの既定では行わない。必要性が生じた場合は、このversionのまま開始せず、目的、access、保存場所、閲覧者、削除日、別同意を定めた新protocolを承認してから行う。

## 6. 固定task

taskは順に一つずつ提示する。括弧内は観察者用の正答rubricで、参加者へ見せない。

| task ID | 参加者へ渡す目標 | score 2となるteach-back |
|---|---|---|
| `denominator` | 画面の400、43、357がそれぞれ誰を数えるか説明してください | `N=400`は同じscreeningを受けた総数、`m=43`は境界内、`357=N-m`は確認済み範囲外と区別する |
| `missingness` | 「未測定を分離」の例で、なぜfitを止めるのかと次に直す記録を説明してください | 未測定・故障・同意撤回は範囲外と確認されておらず、除外理由と分母を分けると説明する |
| `conditional_vs_count` | 二つのfitが違う理由を、使った情報の違いから説明してください | 条件付きfitは選択値だけ、selection-count fitは選択前`N`と選択数`m`も使うと説明する |
| `unresolved_interval` | profile未解決とbootstrap未解決を開き、報告してよい区間と次の行動を説明してください | `search_limit`／`insufficient_success`は区間なしで、0埋め・Waldへの黙った置換・自動選択をしないと説明する |
| `family_scope` | LogNormal反例で、選択率が合っていてもNormal fitを採用できない理由を説明してください | support外の負値またはtail予測の破綻を挙げ、family診断が別に必要と説明する |

終了時に5概念を画面を閉じずにteach-backしてもらう。用語の完全一致ではなく意味で採点し、発話の逐語録は保存しない。

## 7. 観察rubric

各taskを次の構造だけで記録する。

- `completion`: `independent`、`minor_prompt`、`major_prompt`、`not_completed`、`participant_stopped`
- `teach_back_score`: 0=中心概念が誤り、1=一部正しいが重要な区別が欠ける、2=表の基準を満たす
- `prompt_count`: facilitatorが正解を含まない促しを行った回数
- `elapsed_seconds`: 任意。速さを能力得点にせず、迷いが生じた位置を比較する補助値
- `issue_codes`: 事前codeまたはround中に発見したUI issue code。個人情報や発話を書かない

「ここを押してください」「357人は範囲外です」のような答えを含む助言は`major_prompt`であり、独立完了に数えない。参加者が中止した場合は空欄を成功扱いせず`participant_stopped`とする。

## 8. 事前固定した判定

### insufficient evidence

- そのroundの完了者が4人未満
- confirmation時点の2 round累計完了者が8人未満
- schemaを満たす観察票または同意・data management確認が欠ける

### revise and retest

次のどれかなら`revise_retest`とする。

- いずれかのtaskで`independent`が完了者の75%未満
- `missingness`または`unresolved_interval`でscore 2が100%未満
- その他のtaskでscore 2が75%未満
- 未解決の`blocker`または`major` issueが1件以上
- labelやerror文が何を直すか伝えず、W3Cの[Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)または[Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)に反する問題が見つかった

### confirmation candidate

`confirmation_candidate`は、confirmation roundで上の不足・再設計条件が一つもなく、keyboard-only sessionが少なくとも1件成功し、全issueに`resolved`または根拠つき`accepted_research_boundary`を付けた場合だけ選べる。これはcatalog公開の十分条件ではなく、利用者理解blockerだけを次の審査へ送る状態である。

## 9. Data boundary

1. 上記の参加者向けpreviewとchecked-in合成fixtureだけを使い、参加者自身のCSVや値を入力しない。
2. 氏名、email、電話、住所、学籍番号、IP、診断名、署名、連絡先、音声、映像、逐語録を観察JSONへ入れない。
3. 同意記録と連絡先は観察票から分離し、承認された保管場所・権限で扱う。
4. 実観察票をこのrepository、Git履歴、issue、PR、Dropbox同期directoryへ置かない。checked-in fixtureは`record_kind = synthetic_example`だけにする。
5. 募集前に、責任者、保存場所、閲覧者、分析完了日、具体的な削除日を研究計画へ記入する。未記入なら開始しない。
6. repositoryへ戻せるのは、直接識別子、逐語引用、少数属性内訳を含まないround集約だけである。keyboard-only結果も人数ではなくgate達成booleanだけを残す。小cellの公開可否は別途確認する。
7. external telemetry、analytics、session replayは導入しない。

## 10. Versioned records

- private structured observation: `learning-julia.p2.learner-usability-observation` v1.0.0
- repository-safe aggregate: `learning-julia.p2.learner-usability-round-summary` v1.0.0
- schema: `learner-usability-observation-v1.schema.json`、`learner-usability-round-summary-v1.schema.json`
- checked-in examples: `fixtures/learner-usability-*-v1.example.json`

実観察にはprivate observation schemaを使うがrepositoryへcommitしない。round終了後、二人でstructured countsとissueを照合し、aggregate schemaへ転記する。分析はsession後できるだけ早く行い、観察、finding、design actionを混同しない。GOV.UKの[research session analysis guidance](https://www.gov.uk/service-manual/user-research/analyse-a-research-session)も、観察を整理しfindingとactionへ進む段階を分けている。

## 11. 実施前checklist

- [ ] practice sessionを通し、task文が答えを示していない
- [ ] 対象者条件とaccess needsへの対応を募集文へ記載した
- [ ] 同意文、責任者、保存場所、閲覧者、削除日が承認済み
- [ ] 共有URLのpreviewと合成fixtureだけを使う
- [ ] facilitatorとobserverがscore 0/1/2の例を同じように採点できる
- [ ] 中止・休憩方法を導入scriptで伝える
- [ ] 実観察票をrepository／Dropboxへ保存しない
- [ ] round後の分析時間と修正担当を確保した

このchecklistが埋まるまではparticipant sessionを開始しない。
