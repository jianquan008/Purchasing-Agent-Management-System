/**
 * Test data and utilities for receipt recognition testing
 */

export interface TestReceiptItem {
  itemName: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface TestReceiptData {
  name: string;
  description: string;
  imageQuality: 'excellent' | 'good' | 'poor';
  expectedConfidence: number;
  items: TestReceiptItem[];
  language: 'chinese' | 'english' | 'mixed';
  receiptType: 'handwritten' | 'printed' | 'thermal' | 'digital';
  specialFeatures?: string[];
}

/**
 * 中文收据测试数据
 */
export const chineseReceiptTestData: TestReceiptData[] = [
  {
    name: '中文手写收据',
    description: '传统手写中文收据，包含常见食品',
    imageQuality: 'good',
    expectedConfidence: 0.82,
    language: 'chinese',
    receiptType: 'handwritten',
    items: [
      { itemName: '白菜', unitPrice: 3.5, quantity: 2, totalPrice: 7.0 },
      { itemName: '猪肉', unitPrice: 28.0, quantity: 1, totalPrice: 28.0 },
      { itemName: '鸡蛋', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 },
      { itemName: '牛奶', unitPrice: 15.5, quantity: 2, totalPrice: 31.0 }
    ]
  },
  {
    name: '中文超市收据',
    description: '现代超市打印收据，包含商品编码',
    imageQuality: 'excellent',
    expectedConfidence: 0.94,
    language: 'chinese',
    receiptType: 'printed',
    specialFeatures: ['商品编码', '条形码'],
    items: [
      { itemName: '可口可乐 330ml', unitPrice: 3.0, quantity: 3, totalPrice: 9.0 },
      { itemName: '薯片(原味)', unitPrice: 8.5, quantity: 2, totalPrice: 17.0 },
      { itemName: '矿泉水 500ml×6', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 },
      { itemName: '面包 - 全麦', unitPrice: 6.8, quantity: 2, totalPrice: 13.6 }
    ]
  },
  {
    name: '中文餐厅收据',
    description: '餐厅手写收据，包含菜品名称',
    imageQuality: 'good',
    expectedConfidence: 0.78,
    language: 'chinese',
    receiptType: 'handwritten',
    specialFeatures: ['手写字体', '菜品描述'],
    items: [
      { itemName: '宫保鸡丁', unitPrice: 28.0, quantity: 1, totalPrice: 28.0 },
      { itemName: '麻婆豆腐', unitPrice: 18.0, quantity: 1, totalPrice: 18.0 },
      { itemName: '米饭', unitPrice: 3.0, quantity: 2, totalPrice: 6.0 },
      { itemName: '青菜汤', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 }
    ]
  }
];

/**
 * 英文收据测试数据
 */
export const englishReceiptTestData: TestReceiptData[] = [
  {
    name: '英文超市收据',
    description: '美式超市标准收据格式',
    imageQuality: 'excellent',
    expectedConfidence: 0.92,
    language: 'english',
    receiptType: 'printed',
    items: [
      { itemName: 'Organic Bananas', unitPrice: 2.99, quantity: 2, totalPrice: 5.98 },
      { itemName: 'Whole Milk 1 Gallon', unitPrice: 4.49, quantity: 1, totalPrice: 4.49 },
      { itemName: 'Bread - Whole Wheat', unitPrice: 3.29, quantity: 1, totalPrice: 3.29 },
      { itemName: 'Chicken Breast', unitPrice: 8.99, quantity: 2, totalPrice: 17.98 }
    ]
  },
  {
    name: '英文便利店收据',
    description: '便利店收据，包含缩写和代码',
    imageQuality: 'good',
    expectedConfidence: 0.87,
    language: 'english',
    receiptType: 'printed',
    specialFeatures: ['商品缩写', '产品代码'],
    items: [
      { itemName: 'COCA COLA 12PK', unitPrice: 5.99, quantity: 1, totalPrice: 5.99 },
      { itemName: 'CHIPS LAYS REG', unitPrice: 3.49, quantity: 2, totalPrice: 6.98 },
      { itemName: 'WATER BTL 24PK', unitPrice: 4.99, quantity: 1, totalPrice: 4.99 },
      { itemName: 'APPLES GALA LB', unitPrice: 1.99, quantity: 3, totalPrice: 5.97 }
    ]
  },
  {
    name: '英文餐厅收据',
    description: '餐厅收据，包含详细菜品描述',
    imageQuality: 'good',
    expectedConfidence: 0.85,
    language: 'english',
    receiptType: 'printed',
    specialFeatures: ['菜品描述', '价格变动'],
    items: [
      { itemName: 'Caesar Salad', unitPrice: 12.95, quantity: 1, totalPrice: 12.95 },
      { itemName: 'Grilled Salmon', unitPrice: 24.99, quantity: 1, totalPrice: 24.99 },
      { itemName: 'French Fries', unitPrice: 6.50, quantity: 2, totalPrice: 13.00 },
      { itemName: 'Soft Drink', unitPrice: 2.99, quantity: 2, totalPrice: 5.98 }
    ]
  }
];

/**
 * 混合语言收据测试数据
 */
export const mixedLanguageReceiptTestData: TestReceiptData[] = [
  {
    name: '中英混合电子产品收据',
    description: '电子产品店收据，中英文混合',
    imageQuality: 'good',
    expectedConfidence: 0.84,
    language: 'mixed',
    receiptType: 'printed',
    specialFeatures: ['品牌名称', '型号规格'],
    items: [
      { itemName: 'iPhone 充电器', unitPrice: 199.0, quantity: 1, totalPrice: 199.0 },
      { itemName: 'Samsung Galaxy Case', unitPrice: 89.0, quantity: 1, totalPrice: 89.0 },
      { itemName: '无线耳机 AirPods', unitPrice: 1299.0, quantity: 1, totalPrice: 1299.0 },
      { itemName: 'MacBook Pro 保护套', unitPrice: 299.0, quantity: 1, totalPrice: 299.0 }
    ]
  },
  {
    name: '中英混合咖啡店收据',
    description: '咖啡店收据，包含特殊字符和表情符号',
    imageQuality: 'good',
    expectedConfidence: 0.79,
    language: 'mixed',
    receiptType: 'printed',
    specialFeatures: ['表情符号', '特殊字符'],
    items: [
      { itemName: 'Café ☕ 拿铁', unitPrice: 28.0, quantity: 2, totalPrice: 56.0 },
      { itemName: 'Croissant 🥐 牛角包', unitPrice: 15.0, quantity: 3, totalPrice: 45.0 },
      { itemName: 'Juice 100% 橙汁', unitPrice: 18.0, quantity: 1, totalPrice: 18.0 },
      { itemName: 'Sandwich 三明治', unitPrice: 35.0, quantity: 1, totalPrice: 35.0 }
    ]
  }
];

/**
 * 特殊格式收据测试数据
 */
export const specialFormatReceiptTestData: TestReceiptData[] = [
  {
    name: '热敏纸收据',
    description: '热敏打印机收据，文字可能模糊',
    imageQuality: 'poor',
    expectedConfidence: 0.65,
    language: 'chinese',
    receiptType: 'thermal',
    specialFeatures: ['文字模糊', '对比度低'],
    items: [
      { itemName: '热敏纸商品A', unitPrice: 12.5, quantity: 1, totalPrice: 12.5 },
      { itemName: '热敏纸商品B', unitPrice: 8.0, quantity: 2, totalPrice: 16.0 },
      { itemName: '热敏纸商品C', unitPrice: 25.0, quantity: 1, totalPrice: 25.0 }
    ]
  },
  {
    name: '表格格式收据',
    description: '标准表格格式的收据',
    imageQuality: 'good',
    expectedConfidence: 0.88,
    language: 'chinese',
    receiptType: 'printed',
    specialFeatures: ['表格布局', '对齐格式'],
    items: [
      { itemName: '商品名称A', unitPrice: 15.0, quantity: 2, totalPrice: 30.0 },
      { itemName: '商品名称B', unitPrice: 22.5, quantity: 1, totalPrice: 22.5 },
      { itemName: '商品名称C', unitPrice: 8.8, quantity: 3, totalPrice: 26.4 },
      { itemName: '商品名称D', unitPrice: 45.0, quantity: 1, totalPrice: 45.0 }
    ]
  },
  {
    name: '带水印收据',
    description: '包含水印和背景图案的收据',
    imageQuality: 'good',
    expectedConfidence: 0.76,
    language: 'chinese',
    receiptType: 'printed',
    specialFeatures: ['水印', '背景图案'],
    items: [
      { itemName: '带水印商品1', unitPrice: 18.8, quantity: 1, totalPrice: 18.8 },
      { itemName: '带水印商品2', unitPrice: 32.0, quantity: 2, totalPrice: 64.0 },
      { itemName: '带水印商品3', unitPrice: 9.9, quantity: 3, totalPrice: 29.7 }
    ]
  }
];

/**
 * 错误和边界情况测试数据
 */
export const errorCaseTestData = [
  {
    name: '计算错误收据',
    description: '包含计算错误的收据数据',
    items: [
      { itemName: '计算错误商品A', unitPrice: 10.0, quantity: 3, totalPrice: 35.0 }, // Wrong: should be 30.0
      { itemName: '计算正确商品B', unitPrice: 15.0, quantity: 2, totalPrice: 30.0 }, // Correct
      { itemName: '计算错误商品C', unitPrice: 8.5, quantity: 4, totalPrice: 30.0 }  // Wrong: should be 34.0
    ],
    expectedCorrectedTotal: 94.0
  },
  {
    name: '无效项目收据',
    description: '包含无效项目的收据数据',
    items: [
      { itemName: '有效商品1', unitPrice: 12.0, quantity: 1, totalPrice: 12.0 },
      { itemName: '', unitPrice: 5.0, quantity: 1, totalPrice: 5.0 }, // Invalid: empty name
      { itemName: '小计', unitPrice: 0, quantity: 0, totalPrice: 17.0 }, // Invalid: subtotal
      { itemName: '有效商品2', unitPrice: 25.0, quantity: 2, totalPrice: 50.0 },
      { itemName: '店名：测试商店', unitPrice: 0, quantity: 0, totalPrice: 0 }, // Invalid: store info
      { itemName: '负价商品', unitPrice: -10.0, quantity: 1, totalPrice: -10.0 }, // Invalid: negative
      { itemName: '有效商品3', unitPrice: 8.5, quantity: 1, totalPrice: 8.5 }
    ],
    expectedValidItems: 3,
    expectedCorrectedTotal: 70.5
  }
];

/**
 * 性能测试数据生成器
 */
export class PerformanceTestDataGenerator {
  /**
   * 生成指定数量的测试收据项目
   */
  static generateItems(count: number, namePrefix: string = '测试商品'): TestReceiptItem[] {
    return Array.from({ length: count }, (_, i) => ({
      itemName: `${namePrefix}${i + 1}`,
      unitPrice: Math.round((Math.random() * 50 + 1) * 100) / 100,
      quantity: Math.floor(Math.random() * 5) + 1,
      totalPrice: 0 // Will be calculated
    })).map(item => ({
      ...item,
      totalPrice: Math.round(item.unitPrice * item.quantity * 100) / 100
    }));
  }

  /**
   * 生成大型收据测试数据
   */
  static generateLargeReceipt(itemCount: number): TestReceiptData {
    const items = this.generateItems(itemCount, '大型收据商品');
    return {
      name: `大型收据_${itemCount}项`,
      description: `包含${itemCount}个商品的大型收据`,
      imageQuality: 'good',
      expectedConfidence: Math.max(0.6, 0.9 - (itemCount / 100) * 0.1), // Confidence decreases with complexity
      language: 'chinese',
      receiptType: 'printed',
      items
    };
  }

  /**
   * 生成并发测试用的收据数据
   */
  static generateConcurrentTestData(count: number): TestReceiptData[] {
    return Array.from({ length: count }, (_, i) => ({
      name: `并发测试收据${i + 1}`,
      description: `并发测试用收据${i + 1}`,
      imageQuality: 'good',
      expectedConfidence: 0.85,
      language: 'chinese',
      receiptType: 'printed',
      items: this.generateItems(Math.floor(Math.random() * 10) + 1, `并发商品${i + 1}_`)
    }));
  }
}

/**
 * 测试工具函数
 */
export class ReceiptTestUtils {
  /**
   * 创建模拟的Claude响应
   */
  static createMockClaudeResponse(testData: TestReceiptData) {
    return {
      body: new TextEncoder().encode(JSON.stringify({
        content: [{
          type: 'text',
          text: JSON.stringify({
            items: testData.items,
            totalAmount: testData.items.reduce((sum, item) => sum + item.totalPrice, 0),
            confidence: testData.expectedConfidence
          })
        }]
      }))
    };
  }

  /**
   * 验证OCR结果的准确性
   */
  static validateOCRResult(result: any, expectedData: TestReceiptData): {
    isValid: boolean;
    errors: string[];
    accuracy: number;
  } {
    const errors: string[] = [];
    let correctItems = 0;

    // 检查项目数量
    if (result.items.length !== expectedData.items.length) {
      errors.push(`项目数量不匹配: 期望${expectedData.items.length}, 实际${result.items.length}`);
    }

    // 检查每个项目
    for (let i = 0; i < Math.min(result.items.length, expectedData.items.length); i++) {
      const resultItem = result.items[i];
      const expectedItem = expectedData.items[i];

      if (resultItem.itemName === expectedItem.itemName &&
          Math.abs(resultItem.unitPrice - expectedItem.unitPrice) < 0.01 &&
          resultItem.quantity === expectedItem.quantity &&
          Math.abs(resultItem.totalPrice - expectedItem.totalPrice) < 0.01) {
        correctItems++;
      } else {
        errors.push(`项目${i + 1}不匹配: ${JSON.stringify(resultItem)} vs ${JSON.stringify(expectedItem)}`);
      }
    }

    // 检查总金额
    const expectedTotal = expectedData.items.reduce((sum, item) => sum + item.totalPrice, 0);
    if (Math.abs(result.totalAmount - expectedTotal) > 0.01) {
      errors.push(`总金额不匹配: 期望${expectedTotal}, 实际${result.totalAmount}`);
    }

    // 检查置信度
    if (Math.abs(result.confidence - expectedData.expectedConfidence) > 0.05) {
      errors.push(`置信度不匹配: 期望${expectedData.expectedConfidence}, 实际${result.confidence}`);
    }

    const accuracy = expectedData.items.length > 0 ? correctItems / expectedData.items.length : 0;

    return {
      isValid: errors.length === 0,
      errors,
      accuracy
    };
  }

  /**
   * 生成性能测试报告
   */
  static generatePerformanceReport(results: Array<{
    testName: string;
    processingTime: number;
    itemCount: number;
    success: boolean;
    confidence?: number;
  }>) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const avgProcessingTime = successful.reduce((sum, r) => sum + r.processingTime, 0) / successful.length;
    const avgConfidence = successful.reduce((sum, r) => sum + (r.confidence || 0), 0) / successful.length;
    const avgItemsPerSecond = successful.reduce((sum, r) => sum + (r.itemCount / (r.processingTime / 1000)), 0) / successful.length;

    return {
      summary: {
        totalTests: results.length,
        successful: successful.length,
        failed: failed.length,
        successRate: (successful.length / results.length) * 100
      },
      performance: {
        averageProcessingTime: Math.round(avgProcessingTime),
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        averageItemsPerSecond: Math.round(avgItemsPerSecond * 100) / 100
      },
      details: results
    };
  }
}