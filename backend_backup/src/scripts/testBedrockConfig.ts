#!/usr/bin/env ts-node

/**
 * AWS Bedrock配置测试脚本
 * 用于验证AWS Bedrock环境配置是否正确
 */

import dotenv from 'dotenv';
import { ConfigValidator } from '../utils/configValidator';
import { BedrockClientUtil } from '../utils/bedrockClient';

// 加载环境变量
dotenv.config();

async function testBedrockConfiguration() {
  console.log('🚀 开始测试AWS Bedrock配置...\n');

  const configValidator = new ConfigValidator();
  const bedrockClient = BedrockClientUtil.getInstance();

  try {
    // 1. 验证环境变量
    console.log('1️⃣ 验证环境变量...');
    const envValidation = configValidator.validateEnvironmentVariables();
    
    if (envValidation.isValid) {
      console.log('✅ 环境变量验证通过');
    } else {
      console.log('❌ 环境变量验证失败:');
      envValidation.errors.forEach(error => console.log(`   - ${error}`));
      return;
    }

    // 2. 显示配置摘要
    console.log('\n2️⃣ 配置摘要:');
    const configSummary = configValidator.getConfigSummary();
    console.log(JSON.stringify(configSummary, null, 2));

    // 3. 测试AWS连接
    console.log('\n3️⃣ 测试AWS Bedrock连接...');
    const awsValidation = await configValidator.validateAWSConfiguration();
    
    if (awsValidation.isValid) {
      console.log('✅ AWS Bedrock连接测试通过');
    } else {
      console.log('❌ AWS Bedrock连接测试失败:');
      awsValidation.errors.forEach(error => console.log(`   - ${error}`));
      return;
    }

    // 4. 测试简单的API调用
    console.log('\n4️⃣ 测试Bedrock API调用...');
    try {
      const testResponse = await bedrockClient.invokeModel(
        '请回复"配置测试成功"来确认连接正常。',
        undefined,
        { maxRetries: 1 } // 只尝试1次
      );
      
      if (testResponse && testResponse.content && testResponse.content[0]) {
        const responseText = testResponse.content[0].text;
        console.log('✅ API调用成功，响应:', responseText);
      } else {
        console.log('⚠️ API调用成功但响应格式异常:', testResponse);
      }
    } catch (error) {
      console.log('❌ API调用失败:', (error as Error).message);
      return;
    }

    console.log('\n🎉 所有测试通过！AWS Bedrock配置正确。');

  } catch (error) {
    console.error('\n💥 测试过程中发生错误:', (error as Error).message);
    console.error('堆栈信息:', (error as Error).stack);
  }
}

// 运行测试
if (require.main === module) {
  testBedrockConfiguration()
    .then(() => {
      console.log('\n测试完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('测试失败:', error);
      process.exit(1);
    });
}

export { testBedrockConfiguration };