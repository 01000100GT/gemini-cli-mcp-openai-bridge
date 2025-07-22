# Google Cloud CLI 认证详细使用指南

## 概述

`gcloud auth application-default login` 是 Google Cloud CLI 提供的应用程序默认凭据 (Application Default Credentials, ADC) 认证方式，它是连接 Google Cloud 服务（包括 Gemini API）的推荐认证方法。

## 什么是应用程序默认凭据 (ADC)

应用程序默认凭据是 Google Cloud 客户端库自动查找和使用凭据的标准方式。它按以下优先级顺序查找凭据：

1. **环境变量** `GOOGLE_APPLICATION_CREDENTIALS` 指向的服务账号密钥文件
2. **gcloud CLI 用户凭据** (通过 `gcloud auth application-default login` 设置)
3. **Google Cloud 元数据服务** (在 GCE、Cloud Run 等环境中)
4. **默认服务账号** (在 Google Cloud 环境中)

## 安装 Google Cloud CLI

### macOS 安装

```bash
# 方式1: 使用 Homebrew (推荐)
brew install --cask google-cloud-sdk

# 方式2: 使用官方安装脚本
curl https://sdk.cloud.google.com | bash
exec -l $SHELL  # 重启 shell

# 方式3: 下载安装包
# 访问 https://cloud.google.com/sdk/docs/install-sdk
```

### Linux 安装

```bash
# Ubuntu/Debian
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
sudo apt-get update && sudo apt-get install google-cloud-cli

# CentOS/RHEL/Fedora
sudo tee -a /etc/yum.repos.d/google-cloud-sdk.repo << EOM
[google-cloud-cli]
name=Google Cloud CLI
baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el8-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg
       https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOM
sudo dnf install google-cloud-cli
```

### Windows 安装

```powershell
# 使用 Chocolatey
choco install gcloudsdk

# 或下载 MSI 安装包
# 访问 https://cloud.google.com/sdk/docs/install-sdk
```

## 详细使用步骤

### 1. 初始化 gcloud CLI

```bash
# 初始化配置
gcloud init

# 或者手动配置
gcloud config set project YOUR_PROJECT_ID
gcloud config set account YOUR_EMAIL@gmail.com
```

在初始化过程中，系统会：
- 要求你登录 Google 账号
- 选择或创建 Google Cloud 项目
- 配置默认的计算区域和地区

### 2. 设置应用程序默认凭据

```bash
# 设置应用程序默认凭据
gcloud auth application-default login
```

执行此命令后：
1. **浏览器自动打开**：系统会自动打开默认浏览器
2. **Google 登录页面**：显示 Google 账号登录界面
3. **授权确认**：需要确认授权 Google Cloud SDK 访问你的账号
4. **凭据保存**：成功后凭据会保存到本地文件系统

### 3. 凭据存储位置

认证成功后，凭据会保存在以下位置：

```bash
# macOS/Linux
~/.config/gcloud/application_default_credentials.json

# Windows
%APPDATA%\gcloud\application_default_credentials.json
```

### 4. 验证认证状态

```bash
# 查看当前认证状态
gcloud auth list

# 查看应用程序默认凭据状态
gcloud auth application-default print-access-token

# 查看当前项目配置
gcloud config list

# 测试 API 访问
gcloud projects list
```

## 高级配置选项

### 配置特定项目

```bash
# 为特定项目设置凭据
gcloud auth application-default login --project=YOUR_PROJECT_ID

# 切换项目
gcloud config set project ANOTHER_PROJECT_ID

# 查看可用项目
gcloud projects list
```

### 配置多个账号

```bash
# 添加新账号
gcloud auth login ANOTHER_EMAIL@gmail.com

# 切换活动账号
gcloud config set account ANOTHER_EMAIL@gmail.com

# 查看所有已认证账号
gcloud auth list

# 为特定账号设置应用程序默认凭据
gcloud auth application-default login --account=SPECIFIC_EMAIL@gmail.com
```

### 配置代理

```bash
# 设置 HTTP 代理
gcloud config set proxy/type http
gcloud config set proxy/address PROXY_HOST
gcloud config set proxy/port PROXY_PORT

# 设置认证代理
gcloud config set proxy/username PROXY_USERNAME
gcloud config set proxy/password PROXY_PASSWORD
```

## 在 Gemini CLI Bridge 中的使用

### 1. 认证流程

```bash
# 步骤1: 设置应用程序默认凭据
gcloud auth application-default login

# 步骤2: 验证认证
gcloud auth application-default print-access-token

# 步骤3: 启动 Gemini CLI Bridge
gemini-cli-bridge --debug
```

### 2. 环境变量配置

```bash
# 可选：显式设置项目ID
export GOOGLE_CLOUD_PROJECT="your-project-id"

# 可选：设置配额项目
export GOOGLE_CLOUD_QUOTA_PROJECT="your-quota-project-id"

# 验证环境变量
echo $GOOGLE_CLOUD_PROJECT
```

### 3. 权限要求

确保你的 Google 账号具有以下权限：

```bash
# 检查 Gemini API 是否启用
gcloud services list --enabled --filter="name:generativelanguage.googleapis.com"

# 启用 Gemini API (如果未启用)
gcloud services enable generativelanguage.googleapis.com

# 检查 IAM 权限
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

需要的最小权限：
- `roles/ml.developer` 或 `roles/aiplatform.user`
- `roles/serviceusage.serviceUsageConsumer`

## 故障排除

### 常见问题及解决方案

#### 1. 认证失败

```bash
# 清除现有凭据
gcloud auth application-default revoke

# 重新认证
gcloud auth application-default login

# 检查凭据文件
ls -la ~/.config/gcloud/application_default_credentials.json
```

#### 2. 权限不足

```bash
# 检查当前用户权限
gcloud auth list

# 检查项目权限
gcloud projects get-iam-policy YOUR_PROJECT_ID --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:YOUR_EMAIL"

# 联系项目管理员添加权限
```

#### 3. 网络连接问题

```bash
# 测试网络连接
curl -I https://accounts.google.com

# 配置代理 (如果需要)
gcloud config set proxy/type http
gcloud config set proxy/address YOUR_PROXY_HOST
gcloud config set proxy/port YOUR_PROXY_PORT

# 测试代理配置
gcloud auth application-default login
```

#### 4. 浏览器问题

```bash
# 手动复制认证链接
gcloud auth application-default login --no-launch-browser

# 系统会显示一个 URL，手动复制到浏览器中打开
# 完成认证后，将授权码粘贴回终端
```

#### 5. 凭据过期

```bash
# 检查凭据有效性
gcloud auth application-default print-access-token

# 如果过期，重新认证
gcloud auth application-default login

# 设置自动刷新
gcloud config set auth/disable_credentials_file false
```

## 安全最佳实践

### 1. 凭据管理

```bash
# 定期轮换凭据
gcloud auth application-default revoke
gcloud auth application-default login

# 检查凭据文件权限
chmod 600 ~/.config/gcloud/application_default_credentials.json

# 不要将凭据文件提交到版本控制
echo "~/.config/gcloud/" >> ~/.gitignore
```

### 2. 项目隔离

```bash
# 为不同环境使用不同项目
gcloud config configurations create development
gcloud config configurations create production

# 切换配置
gcloud config configurations activate development
gcloud config set project dev-project-id

# 查看所有配置
gcloud config configurations list
```

### 3. 最小权限原则

```bash
# 只授予必要的权限
# 避免使用 roles/owner 或 roles/editor
# 优先使用 roles/ml.developer 等具体角色

# 定期审查权限
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

## 与其他认证方式的比较

| 认证方式 | 适用场景 | 优点 | 缺点 |
|---------|----------|------|------|
| **gcloud ADC** | 本地开发、测试 | 简单易用、自动刷新 | 需要交互式登录 |
| **服务账号密钥** | 生产环境、CI/CD | 非交互式、精确控制 | 密钥管理复杂 |
| **API Key** | 简单应用 | 配置简单 | 功能有限、安全性低 |
| **工作负载身份** | GKE、Cloud Run | 最安全、无密钥 | 仅限 Google Cloud 环境 |

## 自动化脚本示例

### 认证检查脚本

```bash
#!/bin/bash
# check_auth.sh - 检查 Google Cloud 认证状态

echo "=== Google Cloud 认证状态检查 ==="

# 检查 gcloud CLI 是否安装
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI 未安装"
    echo "请访问 https://cloud.google.com/sdk/docs/install 安装"
    exit 1
fi

echo "✅ gcloud CLI 已安装: $(gcloud version --format='value(Google Cloud SDK)')"

# 检查是否已登录
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ 未登录 Google Cloud"
    echo "请运行: gcloud auth login"
    exit 1
fi

echo "✅ 已登录账号: $(gcloud auth list --filter=status:ACTIVE --format='value(account)')"

# 检查应用程序默认凭据
if ! gcloud auth application-default print-access-token &> /dev/null; then
    echo "❌ 应用程序默认凭据未设置"
    echo "请运行: gcloud auth application-default login"
    exit 1
fi

echo "✅ 应用程序默认凭据已设置"

# 检查当前项目
PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT" ]; then
    echo "❌ 未设置默认项目"
    echo "请运行: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "✅ 当前项目: $PROJECT"

# 检查 Gemini API 是否启用
if ! gcloud services list --enabled --filter="name:generativelanguage.googleapis.com" --format="value(name)" | grep -q .; then
    echo "⚠️  Gemini API 未启用"
    echo "请运行: gcloud services enable generativelanguage.googleapis.com"
else
    echo "✅ Gemini API 已启用"
fi

echo "\n=== 认证检查完成 ==="
```

### 快速设置脚本

```bash
#!/bin/bash
# setup_gemini_auth.sh - 快速设置 Gemini CLI 认证

set -e

echo "=== Gemini CLI 认证快速设置 ==="

# 检查参数
if [ $# -eq 0 ]; then
    echo "用法: $0 <PROJECT_ID>"
    echo "示例: $0 my-gemini-project"
    exit 1
fi

PROJECT_ID=$1

echo "设置项目: $PROJECT_ID"

# 设置项目
gcloud config set project $PROJECT_ID

# 启用必要的 API
echo "启用 Gemini API..."
gcloud services enable generativelanguage.googleapis.com

# 设置应用程序默认凭据
echo "设置应用程序默认凭据..."
gcloud auth application-default login

# 验证设置
echo "验证设置..."
gcloud auth application-default print-access-token > /dev/null

echo "✅ 设置完成！"
echo "现在可以启动 Gemini CLI Bridge:"
echo "gemini-cli-bridge --debug"
```

## 总结

`gcloud auth application-default login` 是使用 Gemini CLI Bridge 的推荐认证方式，因为它：

1. **简单易用** - 一条命令完成认证设置
2. **自动管理** - 自动处理令牌刷新和过期
3. **安全可靠** - 使用 OAuth 2.0 标准流程
4. **广泛兼容** - 与所有 Google Cloud 客户端库兼容
5. **开发友好** - 特别适合本地开发和测试环境

通过正确配置 gcloud 认证，你可以无缝地使用 Gemini CLI Bridge 的所有功能，包括 MCP 工具调用和 OpenAI API 兼容接口。