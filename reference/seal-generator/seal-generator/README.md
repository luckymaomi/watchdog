# seal-generator
印章样式生成库

## 安装
`npm i S seal-generator`

## 使用
```
import { SealGenerator } from 'seal-generator';

... // 省略

const sg = new SealGenerator();
img.src = sg.getBase64Data('上海xxx有限公司', '测试人员');
```