param(
    [string]$Title = "Civil News Hub",
    [string]$Message = "자동 동기화 및 배포가 완료되었습니다! 🚀"
)

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$nodes = $template.GetElementsByTagName("text")
$nodes.Item(0).AppendChild($template.CreateTextNode($Title)) > $null
$nodes.Item(1).AppendChild($template.CreateTextNode($Message)) > $null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Civil News Hub").Show($toast)
