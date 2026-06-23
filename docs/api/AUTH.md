# 璁よ瘉鎺ュ彛鏂囨。

## 鐢ㄦ埛娉ㄥ唽

**POST** `/api/auth/register`

### 璇锋眰
```json
{
  "email": "user@example.com",
  "password": "<demo-password>",
  "nickname": "鐢ㄦ埛鏄电О"
}
```

### 鍝嶅簲
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "nickname": "鐢ㄦ埛鏄电О"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## 鐢ㄦ埛鐧诲綍

**POST** `/api/auth/login`

### 璇锋眰
```json
{
  "email": "user@example.com",
  "password": "<demo-password>"
}
```

### 鍝嶅簲
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "nickname": "鐢ㄦ埛鏄电О"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## 鑾峰彇鐢ㄦ埛淇℃伅

**GET** `/api/auth/me`

### 鍝嶅簲
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "nickname": "鐢ㄦ埛鏄电О",
    "avatar": "https://...",
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

## Token鍒锋柊

**POST** `/api/auth/refresh`

### 璇锋眰
```json
{
  "refreshToken": "..."
}
```

### 鍝嶅簲
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

