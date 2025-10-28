# 🚀 GitHub部署指南

## 📋 推送到GitHub

### 1. 在GitHub上创建新仓库
1. 登录 [GitHub](https://github.com)
2. 点击右上角的 "+" 按钮，选择 "New repository"
3. 填写仓库信息：
   - Repository name: `daigou-management-system`
   - Description: `智能代购管理系统 - 集成AWS Bedrock Claude OCR`
   - 选择 Public 或 Private
   - 不要初始化 README、.gitignore 或 license（我们已经有了）

### 2. 推送代码到GitHub
```bash
# 添加远程仓库（替换为您的GitHub用户名）
git remote add origin https://github.com/YOUR_USERNAME/daigou-management-system.git

# 推送代码
git branch -M main
git push -u origin main
```

### 3. 设置GitHub Pages（可选）
如果您想要部署静态演示：
1. 进入仓库设置 (Settings)
2. 滚动到 "Pages" 部分
3. 选择 "Deploy from a branch"
4. 选择 "main" 分支和 "/ (root)" 文件夹
5. 点击 "Save"

## 🔧 环境变量配置

### GitHub Secrets设置
为了在GitHub Actions中使用，需要设置以下Secrets：

1. 进入仓库设置 → Secrets and variables → Actions
2. 添加以下Repository secrets：

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
JWT_SECRET=your-production-jwt-secret
```

## 🐳 Docker Hub部署（可选）

### 1. 构建并推送Docker镜像
```bash
# 构建后端镜像
docker build -t your-username/daigou-backend:latest ./backend
docker push your-username/daigou-backend:latest

# 构建前端镜像
docker build -t your-username/daigou-frontend:latest ./frontend
docker push your-username/daigou-frontend:latest
```

### 2. 更新docker-compose.yml
将镜像名称更新为您的Docker Hub用户名。

## 🌐 云平台部署

### Vercel部署（前端）
1. 连接GitHub仓库到Vercel
2. 设置构建命令：`cd frontend && npm run build`
3. 设置输出目录：`frontend/dist`
4. 配置环境变量

### Railway/Render部署（后端）
1. 连接GitHub仓库
2. 设置构建命令：`cd backend && npm install && npm run build`
3. 设置启动命令：`cd backend && npm start`
4. 配置环境变量

### AWS/阿里云部署
使用提供的Docker配置文件进行容器化部署。

## 📊 监控和分析

### GitHub Insights
- 查看代码频率
- 监控贡献者活动
- 分析依赖关系

### 集成第三方服务
- **CodeClimate**: 代码质量分析
- **Snyk**: 安全漏洞扫描
- **Dependabot**: 依赖更新

## 🔄 持续集成/持续部署

项目已配置GitHub Actions工作流：
- 自动运行测试
- 代码质量检查
- 安全审计
- Docker镜像构建

## 📝 发布流程

### 创建Release
1. 更新版本号
2. 更新CHANGELOG.md
3. 创建Git标签：`git tag v1.0.0`
4. 推送标签：`git push origin v1.0.0`
5. 在GitHub上创建Release

### 版本管理
使用语义化版本控制：
- `MAJOR.MINOR.PATCH`
- 例如：`1.0.0`, `1.1.0`, `1.1.1`

## 🎯 下一步

1. **推送代码到GitHub**
2. **设置环境变量**
3. **配置CI/CD**
4. **部署到云平台**
5. **设置监控**

## 📞 获取帮助

如果遇到问题：
- 查看GitHub Issues
- 阅读文档
- 联系维护者

---

**恭喜！您的代购管理系统已准备好部署到GitHub！** 🎉