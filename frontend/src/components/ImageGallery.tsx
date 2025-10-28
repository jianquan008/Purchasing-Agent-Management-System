import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Image, Spin, Empty, Button, Space, Tooltip } from 'antd';
import { EyeOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import OptimizedImage from './OptimizedImage';
import { thumbnailService } from '../utils/thumbnailService';

interface ImageItem {
  id: string;
  url: string;
  thumbnail?: string;
  alt?: string;
  title?: string;
  description?: string;
}

interface ImageGalleryProps {
  images: ImageItem[];
  loading?: boolean;
  columns?: number;
  thumbnailSize?: number;
  showActions?: boolean;
  onPreview?: (image: ImageItem) => void;
  onDownload?: (image: ImageItem) => void;
  onDelete?: (image: ImageItem) => void;
  className?: string;
  style?: React.CSSProperties;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  loading = false,
  columns = 4,
  thumbnailSize = 200,
  showActions = true,
  onPreview,
  onDownload,
  onDelete,
  className,
  style,
}) => {
  const [thumbnails, setThumbnails] = useState<{ [key: string]: string }>({});
  const [thumbnailLoading, setThumbnailLoading] = useState<{ [key: string]: boolean }>({});

  // 生成缩略图
  useEffect(() => {
    if (images.length === 0) return;

    const generateThumbnails = async () => {
      const loadingState: { [key: string]: boolean } = {};
      images.forEach(image => {
        if (!image.thumbnail) {
          loadingState[image.id] = true;
        }
      });
      setThumbnailLoading(loadingState);

      // 批量生成缩略图
      const imageUrls = images
        .filter(image => !image.thumbnail)
        .map(image => image.url);

      if (imageUrls.length > 0) {
        try {
          const generatedThumbnails = await thumbnailService.generateThumbnails(
            imageUrls,
            {
              width: thumbnailSize,
              height: thumbnailSize,
              quality: 0.7,
              format: 'jpeg'
            }
          );

          setThumbnails(prev => ({ ...prev, ...generatedThumbnails }));
        } catch (error) {
          console.error('批量生成缩略图失败:', error);
        }
      }

      // 清除加载状态
      setThumbnailLoading({});
    };

    generateThumbnails();
  }, [images, thumbnailSize]);

  const handlePreview = (image: ImageItem) => {
    if (onPreview) {
      onPreview(image);
    }
  };

  const handleDownload = async (image: ImageItem) => {
    if (onDownload) {
      onDownload(image);
      return;
    }

    // 默认下载逻辑
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = image.title || `image_${image.id}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载图片失败:', error);
    }
  };

  const handleDelete = (image: ImageItem) => {
    if (onDelete) {
      onDelete(image);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="加载图片中..." />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <Empty
        description="暂无图片"
        style={{ padding: '50px' }}
      />
    );
  }

  const responsiveColumns = {
    xs: 1,
    sm: 2,
    md: Math.min(columns, 3),
    lg: Math.min(columns, 4),
    xl: columns,
  };

  return (
    <div className={className} style={style}>
      <Row gutter={[16, 16]}>
        {images.map((image) => {
          const thumbnailUrl = image.thumbnail || thumbnails[image.url] || image.url;
          const isLoading = thumbnailLoading[image.id];

          return (
            <Col key={image.id} {...responsiveColumns}>
              <Card
                hoverable
                cover={
                  <div style={{ position: 'relative', height: thumbnailSize }}>
                    {isLoading ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          backgroundColor: '#f5f5f5',
                        }}
                      >
                        <Spin tip="生成缩略图..." />
                      </div>
                    ) : (
                      <OptimizedImage
                        src={thumbnailUrl}
                        alt={image.alt || image.title}
                        width="100%"
                        height={thumbnailSize}
                        thumbnail={true}
                        quality={0.7}
                        maxWidth={thumbnailSize}
                        maxHeight={thumbnailSize}
                        style={{
                          cursor: 'pointer',
                          objectFit: 'cover',
                        }}
                        onClick={() => handlePreview(image)}
                        preview={false}
                      />
                    )}
                    
                    {/* 悬浮操作按钮 */}
                    {showActions && !isLoading && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          opacity: 0,
                          transition: 'opacity 0.3s ease',
                        }}
                        className="image-actions"
                      >
                        <Space>
                          <Tooltip title="预览">
                            <Button
                              type="primary"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreview(image);
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="下载">
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(image);
                              }}
                            />
                          </Tooltip>
                          {onDelete && (
                            <Tooltip title="删除">
                              <Button
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(image);
                                }}
                              />
                            </Tooltip>
                          )}
                        </Space>
                      </div>
                    )}
                  </div>
                }
                bodyStyle={{ padding: '12px' }}
              >
                {image.title && (
                  <Card.Meta
                    title={
                      <div
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {image.title}
                      </div>
                    }
                    description={
                      image.description && (
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {image.description}
                        </div>
                      )
                    }
                  />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 预览功能 */}
      <div style={{ display: 'none' }}>
        <Image.PreviewGroup>
          {images.map((image) => (
            <Image
              key={`preview-${image.id}`}
              src={image.url}
              alt={image.alt || image.title}
            />
          ))}
        </Image.PreviewGroup>
      </div>

      <style>{`
        .ant-card:hover .image-actions {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
};

export default ImageGallery;