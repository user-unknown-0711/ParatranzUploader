
# Limbus Company 繁體中文手動安裝指引

遊戲版本更新可能導致現行繁體中文化功能無法使用或遊戲初始畫面顯示異常。

若遭遇問題請依照[更新與問題排解](#更新與問題排解)所述步驟更新或停用繁體中文化功能。

- 參考文件
  - [Custom Language Translation Support @1.73](https://store.steampowered.com/news/app/1973530/view/533220039674824263)
  - [Custom Language Title & Content Font Setting Function Updated @1.74](https://store.steampowered.com/news/app/1973530/view/533221941907030183)

## 前置作業

### 下載檔案

- [自訂語言檔案](https://github.com/user-unknown-0711/ParatranzUploader/releases/latest)
  - 下載名稱開頭為 `RHOY_complete_` 的 `.zip` 檔案

### 遊戲安裝位置

![Steam-瀏覽本機檔案](https://hackmd.io/_uploads/rJqC-Csn1l.png)

如上圖開啟對應的遊戲安裝位置 (`...\steamapps\common\Limbus Company`)

### 清除舊檔案

```diff
Limbus Company 遊戲安裝位置
└─LimbusCompany_Data/
-   ├─Lang/
    └─其餘目錄與檔案
```

若遊戲安裝目錄內對應路徑包含 `Lang` 資料夾，請刪除 `Lang` 資料夾，並啟動一次遊戲確認能正常開啟。

## 開始安裝

### 自訂語言檔案

`RHOY_complete_*.zip` 壓縮檔案內包含以下資料:

```text
LimbusCompany_Data/
  └─Lang/
      └─TW/
          ├─BattleAnnouncerDlg/
          ├─BgmLyrics/
          ├─EGOVoiceDig/
          ├─Font/
          │  ├─Context/
          │  └─Title/
          ├─PersonalityVoiceDlg/
          └─StoryData/
```

將檔案解壓縮於 `Limbus Company 遊戲安裝目錄`，並確認如下的對應位置有增加 `Lang` 目錄。

```diff
Limbus Company 遊戲安裝位置
└─LimbusCompany_Data/
+   ├─Lang/
    └─其餘目錄與檔案
```

完成此安裝步驟即可啟動遊戲，進入主畫面確認是否有顯示中文。

## 更新與問題排解

重新下載自訂語言檔案，並重新執行[清除舊檔案](#清除舊檔案)與[自訂語言檔案](#自訂語言檔案)的安裝步驟。

若還是無法正常開啟遊戲，請執行[清除舊檔案](#清除舊檔案)，使用原文遊玩並等待後續更新。
