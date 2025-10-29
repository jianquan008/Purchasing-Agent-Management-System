import request from 'supertest';
import { initDatabase } from '../src/database/init';
import app from '../src/server';

// Mock the server module to avoid starting the actual server
jest.mock('../src/server', () => {
  const express = require('express');
  const cors = require('cors');
  const analyticsRoutes = require('../src/routes/analytics').default;
  const authRoutes = require('../src/routes/auth').default;
  
  const mockApp = express();
  mockApp.use(cors());
  mockApp.use(express.json());
  mockApp.use('/api/auth', authRoutes);
  mockApp.use('/api/analytics', analyticsRoutes);
  
  return mockApp;
});

describe('Analytics API', () => {
  let authToken: string;

  beforeAll(async () => {
    // Initialize test database
    await initDatabase();
    
    // Create test user and get auth token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        password: 'testpass123',
        role: 'admin'
      });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'testpass123'
      });

    authToken = loginResponse.body.token;
  });

  describe('GET /api/analytics/summary', () => {
    it('should return analytics summary data', async () => {
      const response = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('basicStats');
      expect(response.body).toHaveProperty('topItems');
      expect(response.body).toHaveProperty('topUsers');
      expect(response.body).toHaveProperty('recentTrends');
      
      expect(response.body.basicStats).toHaveProperty('totalReceipts');
      expect(response.body.basicStats).toHaveProperty('activeUsers');
      expect(response.body.basicStats).toHaveProperty('uniqueItems');
      expect(response.body.basicStats).toHaveProperty('totalAmount');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/analytics/summary')
        .expect(401);
    });
  });

  describe('GET /api/analytics/trends', () => {
    it('should return trends data with default period', async () => {
      const response = await request(app)
        .get('/api/analytics/trends')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('dateLabel');
      expect(response.body).toHaveProperty('amountTrends');
      expect(response.body).toHaveProperty('quantityTrends');
      
      expect(Array.isArray(response.body.amountTrends)).toBe(true);
      expect(Array.isArray(response.body.quantityTrends)).toBe(true);
    });

    it('should accept period parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/trends?period=day')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.period).toBe('day');
      expect(response.body.dateLabel).toBe('date');
    });
  });

  describe('GET /api/analytics/item-frequency', () => {
    it('should return item frequency data', async () => {
      const response = await request(app)
        .get('/api/analytics/item-frequency')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/item-frequency?limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/analytics/seasonal-patterns', () => {
    it('should return seasonal patterns data', async () => {
      const response = await request(app)
        .get('/api/analytics/seasonal-patterns')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('year');
      expect(response.body).toHaveProperty('monthly');
      expect(response.body).toHaveProperty('quarterly');
      expect(response.body).toHaveProperty('weekday');
      
      expect(Array.isArray(response.body.monthly)).toBe(true);
      expect(Array.isArray(response.body.quarterly)).toBe(true);
      expect(Array.isArray(response.body.weekday)).toBe(true);
    });
  });

  describe('GET /api/analytics/user-behavior', () => {
    it('should return user behavior data', async () => {
      const response = await request(app)
        .get('/api/analytics/user-behavior')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });
  });

  describe('GET /api/analytics/price-trends', () => {
    it('should require itemName parameter', async () => {
      await request(app)
        .get('/api/analytics/price-trends')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return price trends for specific item', async () => {
      const response = await request(app)
        .get('/api/analytics/price-trends?itemName=测试商品')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('itemName');
      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('trends');
      expect(Array.isArray(response.body.trends)).toBe(true);
    });
  });
});