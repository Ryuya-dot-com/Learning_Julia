args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) {
  stop("usage: Rscript --vanilla summarize_trials.R INPUT.csv OUTPUT.csv")
}

input_path <- args[[1]]
output_path <- args[[2]]
trials <- read.csv(
  input_path,
  stringsAsFactors = FALSE,
  check.names = FALSE,
  na.strings = c("", "NA")
)

required <- c("participant_id", "trial", "condition", "rt_ms", "correct")
if (!identical(names(trials), required)) stop("列名または列順がschemaと一致しません")
if (anyNA(trials[c("participant_id", "trial", "condition", "correct")])) {
  stop("必須列に欠損があります")
}
correct_tokens <- tolower(as.character(trials$correct))
if (!all(correct_tokens %in% c("true", "false"))) {
  stop("correctはtrueまたはfalseである必要があります")
}
trials$correct <- correct_tokens == "true"
if (anyDuplicated(trials[c("participant_id", "trial")])) {
  stop("participant_idとtrialの組が重複しています")
}
if (!all(trials$condition %in% c("control", "treatment"))) {
  stop("conditionに許可されていない値があります")
}
if (!all(trials$trial >= 1L)) stop("trialは1以上である必要があります")
if (any(trials$correct & is.na(trials$rt_ms))) {
  stop("correct=trueの行ではrt_msが必要です")
}
if (any(!is.na(trials$rt_ms) & (trials$rt_ms < 100 | trials$rt_ms > 3000))) {
  stop("rt_msが許容範囲外です")
}

observed <- trials[!is.na(trials$rt_ms), , drop = FALSE]
counts <- aggregate(rt_ms ~ condition, observed, length)
means <- aggregate(rt_ms ~ condition, observed, mean)
sds <- aggregate(rt_ms ~ condition, observed, sd)
names(counts)[[2]] <- "n"
names(means)[[2]] <- "mean_rt_ms"
names(sds)[[2]] <- "sd_rt_ms"
summary <- Reduce(function(x, y) merge(x, y, by = "condition"), list(counts, means, sds))
summary <- summary[order(summary$condition), , drop = FALSE]

write.csv(summary, output_path, row.names = FALSE, na = "NA")
