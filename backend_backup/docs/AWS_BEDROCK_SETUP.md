# AWS Bedrock Claude集成配置指南

本文档介绍如何配置AWS Bedrock Claude模型用于OCR收据识别功能。

## 前置条件

1. AWS账户
2. 已启用AWS Bedrock服务
3. 已申请Claude模型访问权限

## 配置步骤

### 1. 获取AWS访问凭据

在AWS控制台中创建IAM用户并获取访问密钥：

1. 登录AWS控制台
2. 进入IAM服务
3. 创建新用户或使用现有用户
4. 为用户添加以下权限策略：

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:ListFoundationModels"
            ],
            "Resource": "*"
        }
    ]
}
```

5. 生成访问密钥对（Access Key ID 和 Secret Access Key）

### 2. 配置环境变量

在后端项目根目录创建 `.env` 文件（或更新现有文件），添加以下配置：

```bash
# AWS Bedrock Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

### 3. 支持的Claude模型

目前支持以下Claude模型：

- `anthropic.claude-3-sonnet-20240229-v1:0` (推荐)
- `anthropic.claude-3-haiku-20240307-v1:0` (更快，成本更低)
- `anthropic.claude-3-opus-20240229-v1:0` (最高质量)

### 4. 区域选择

推荐使用以下AWS区域：

- `us-east-1` (弗吉尼亚北部) - 默认推荐
- `us-west-2` (俄勒冈)
- `eu-west-1` (爱尔兰)

## 验证配置

### 方法1: 使用测试脚本

```bash
cd backend
npm run test:bedrock
```

### 方法2: 检查健康检查端点

启动服务器后访问：
```
GET http://localhost:3001/api/health
```

响应中会包含AWS配置状态。

### 方法3: 查看服务器启动日志

启动服务器时会自动验证AWS配置：

```bash
npm run dev
```

查看控制台输出中的AWS配置验证信息。

## 故障排除

### 常见错误

1. **Missing environment variable: AWS_REGION**
   - 确保在 `.env` 文件中设置了所有必需的环境变量

2. **Invalid AWS region format**
   - 检查AWS区域格式是否正确（如：us-east-1）

3. **Invalid Bedrock model ID format**
   - 确保模型ID格式正确（如：anthropic.claude-3-sonnet-20240229-v1:0）

4. **Access denied**
   - 检查IAM用户权限
   - 确保已申请Claude模型访问权限

5. **Model not found**
   - 确保在指定区域中该模型可用
   - 检查模型ID是否正确

### 调试步骤

1. 验证环境变量是否正确设置
2. 检查AWS凭据是否有效
3. 确认Bedrock服务在指定区域可用
4. 验证Claude模型访问权限

## 成本优化

1. **选择合适的模型**：
   - Haiku：最便宜，适合简单OCR任务
   - Sonnet：平衡性能和成本
   - Opus：最高质量，成本最高

2. **优化请求**：
   - 压缩图像大小
   - 使用精确的提示词
   - 实现请求缓存

3. **监控使用量**：
   - 定期检查AWS账单
   - 设置使用量警报

## 安全注意事项

1. **保护访问密钥**：
   - 不要将密钥提交到版本控制
   - 定期轮换访问密钥
   - 使用最小权限原则

2. **网络安全**：
   - 使用HTTPS传输
   - 考虑使用VPC端点

3. **数据隐私**：
   - 了解AWS数据处理政策
   - 考虑数据驻留要求

## 更多资源

- [AWS Bedrock文档](https://docs.aws.amazon.com/bedrock/)
- [Claude模型文档](https://docs.anthropic.com/claude/docs)
- [AWS IAM最佳实践](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)