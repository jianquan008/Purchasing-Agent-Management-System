# 贡献指南

感谢您对代购管理系统的关注！我们欢迎所有形式的贡献。

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn
- Git

### 本地开发设置

1. **Fork 并克隆仓库**
```bash
git clone https://github.com/your-username/daigou-management-system.git
cd daigou-management-system
```

2. **安装依赖**
```bash
# 后端依赖
cd backend && npm install

# 前端依赖
cd ../frontend && npm install
```

3. **配置环境变量**
```bash
cp .env.example backend/.env
# 编辑 backend/.env 文件
```

4. **启动开发服务器**
```bash
# 启动后端
cd backend && npm run dev

# 启动前端
cd frontend && npm run dev
```

## 📝 代码规范

### TypeScript
- 使用严格的TypeScript配置
- 为所有函数和组件添加类型注解
- 避免使用 `any` 类型

### 代码风格
- 使用 ESLint 和 Prettier
- 遵循现有的代码风格
- 使用有意义的变量和函数名

### 提交信息
使用约定式提交格式：
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

类型包括：
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式化
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

示例：
```
feat(ocr): add batch processing support
fix(auth): resolve token expiration issue
docs: update installation guide
```

## 🧪 测试

### 运行测试
```bash
# 后端测试
cd backend && npm test

# 前端测试
cd frontend && npm test
```

### 编写测试
- 为新功能编写单元测试
- 确保测试覆盖率不降低
- 使用描述性的测试名称

## 🐛 Bug 报告

使用 GitHub Issues 报告 bug，请包含：

1. **环境信息**
   - 操作系统
   - Node.js 版本
   - 浏览器版本

2. **重现步骤**
   - 详细的操作步骤
   - 预期结果
   - 实际结果

3. **附加信息**
   - 错误日志
   - 截图（如适用）
   - 相关配置

## 💡 功能建议

我们欢迎新功能建议！请：

1. 检查是否已有类似的建议
2. 详细描述功能需求
3. 说明使用场景
4. 考虑实现的复杂性

## 📋 Pull Request 流程

1. **创建分支**
```bash
git checkout -b feature/your-feature-name
```

2. **开发和测试**
   - 编写代码
   - 添加测试
   - 确保所有测试通过

3. **提交更改**
```bash
git add .
git commit -m "feat: add your feature"
```

4. **推送分支**
```bash
git push origin feature/your-feature-name
```

5. **创建 Pull Request**
   - 使用清晰的标题和描述
   - 链接相关的 Issues
   - 添加截图（如适用）

## 📚 文档

### 更新文档
- 为新功能添加文档
- 更新 README.md
- 添加代码注释

### API 文档
- 使用 JSDoc 注释
- 更新 API 文档
- 提供使用示例

## 🔍 代码审查

所有 Pull Request 都需要代码审查：

- 至少一个维护者的批准
- 所有测试必须通过
- 符合代码规范
- 文档完整

## 🏷️ 发布流程

1. 更新版本号
2. 更新 CHANGELOG.md
3. 创建 Git 标签
4. 发布到 npm（如适用）

## 📞 获取帮助

如果您需要帮助：

- 查看现有的 Issues 和 Discussions
- 创建新的 Discussion
- 联系维护者

## 🙏 致谢

感谢所有贡献者的努力！您的贡献让这个项目变得更好。