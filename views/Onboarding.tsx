import React, { useState, useRef } from 'react';
import { View } from '../types';

interface Props {
  onComplete: (bodyImage: string | null, isComplete?: boolean, gender?: 'male' | 'female', bodyStyle?: string, idealImage?: string | null) => void;
}

const Onboarding: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyStyle, setBodyStyle] = useState<string>('');

  type BodyStyleOption = {
    id: string;
    label: string;
    en: string;
    image?: string;
  };

  const femaleStyles: BodyStyleOption[] = [
    { id: 'comic', label: '漫画型', en: 'Slim & Toned' },
    { id: 'athletic', label: '力量型', en: 'Athletic' },
    { id: 'muscular', label: '健美型', en: 'Muscular' },
  ];

  const maleStyles: BodyStyleOption[] = [
    { id: 'slim', label: '薄肌型', en: 'Slim & Toned', image: '/man-models/薄肌型.png' },
    { id: 'athletic', label: '力量型', en: 'Athletic', image: '/man-models/力量型.png' },
    { id: 'muscular', label: '健美型', en: 'Muscular', image: '/man-models/健美型.png' },
  ];

  // Body metrics state
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(62.5);
  const [age, setAge] = useState(26);

  // Photo state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [customIdealImage, setCustomIdealImage] = useState<string | null>(null);

  // File input refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const idealGalleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };

  const handleIdealFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomIdealImage(reader.result as string);
        setBodyStyle('custom');
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };

  const triggerCamera = () => {
    if (cameraInputRef.current) cameraInputRef.current.click();
  };

  const triggerGallery = () => {
    if (galleryInputRef.current) galleryInputRef.current.click();
  };

  const handleSkip = () => {
    if (step <= 2) {
      // Skip basic profile / ideal shape -> Incomplete state
      onComplete(null, false, gender, bodyStyle);
    } else {
      // Skip body upload -> Complete state
      onComplete(selectedImage, true, gender, bodyStyle);
    }
  };

  return (
    <div className="min-h-screen bg-[#05040a] text-white p-6 relative overflow-hidden flex flex-col font-sans">
      {/* Background Ambience */}
      <div className="absolute top-[-10%] left-[-20%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] right-[-10%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-10 pt-4 mb-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => step > 1 ? setStep(step - 1) : null} className={`p-2 rounded-full hover:bg-white/10 ${step === 1 ? 'invisible' : ''}`}>
            <span className="material-icons-round">arrow_back</span>
          </button>
          <span className="text-[10px] font-bold tracking-[0.2em] bg-white/5 border border-white/10 px-3 py-1 rounded-full">STEP {step}/3</span>
          <button className="p-2 rounded-full hover:bg-white/10">
            <span className="material-icons-round">help_outline</span>
          </button>
          <button onClick={handleSkip} className="text-xs text-white/50 bg-white/5 px-3 py-1 rounded-full hover:bg-white/10 ml-2">
            跳过
          </button>
        </div>

        <h1 className="text-3xl font-serif font-black leading-[1.2] mb-2">
          {step === 1 ? <>完善<br />身体数据</> :
            step === 2 ? <>设定你的<br /><span className="text-primary text-4xl">理想形态</span></> :
              <>上传<br />身材照</>}
        </h1>
        <p className="text-white/40 text-xs tracking-widest">
          {step === 1 ? "AI将根据数据建立基础模型" :
            step === 2 ? "选择一个目标，RightNow将为你定制专属计划" :
              "生成你的专属 3D 进化模型"}
        </p>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex flex-col w-full overflow-hidden">
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            {/* Gender Selection */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setGender('male')}
                className={`py-4 rounded-3xl flex items-center justify-center gap-2 border transition-all ${gender === 'male'
                  ? 'bg-primary text-black border-primary shadow-[0_0_15px_rgba(184,255,0,0.3)]'
                  : 'glass text-gray-400 border-white/5 hover:bg-white/10'
                  }`}
              >
                <span className="material-icons-round">male</span>
                <span className="font-bold">男</span>
              </button>
              <button
                onClick={() => setGender('female')}
                className={`py-4 rounded-3xl flex items-center justify-center gap-2 border transition-all ${gender === 'female'
                  ? 'bg-primary text-black border-primary shadow-[0_0_15px_rgba(184,255,0,0.3)]'
                  : 'glass text-gray-400 border-white/5 hover:bg-white/10'
                  }`}
              >
                <span className="material-icons-round">female</span>
                <span className="font-bold">女</span>
              </button>
            </div>
            {/* Height Input */}
            <div className="glass p-6 rounded-3xl border border-white/5">
              <div className="flex justify-between items-end mb-4">
                <span className="text-gray-400 text-sm">身高 (Height)</span>
                <div className="flex items-baseline">
                  <input
                    type="number"
                    value={height || ''}
                    onChange={(e) => setHeight(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    onBlur={() => setHeight(height ? Math.min(300, Math.max(100, height)) : 170)}
                    className="text-3xl font-bold font-serif bg-transparent outline-none w-24 text-right text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm font-sans text-gray-500 ml-1">cm</span>
                </div>
              </div>
              <input
                type="range"
                min="100"
                max="300"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Weight and Age Inputs */}
            <div className="flex gap-4">
              <div className="glass p-6 rounded-3xl flex-1 flex flex-col justify-between border border-white/5">
                <div>
                  <span className="text-gray-400 text-sm block mb-2">体重</span>
                  <div className="flex items-baseline mb-4">
                    <input
                      type="number"
                      value={weight || ''}
                      onChange={(e) => setWeight(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      onBlur={() => setWeight(weight ? Math.min(150, Math.max(30, weight)) : 60)}
                      className="text-3xl font-bold font-serif bg-transparent outline-none w-20 text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-gray-500 ml-1">kg</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="30"
                  max="150"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="glass p-6 rounded-3xl flex-1 flex flex-col justify-between border border-white/5">
                <div>
                  <span className="text-gray-400 text-sm block mb-2">年龄</span>
                  <div className="flex items-baseline mb-4">
                    <input
                      type="number"
                      value={age || ''}
                      onChange={(e) => setAge(e.target.value === '' ? 0 : parseInt(e.target.value))}
                      onBlur={() => setAge(age ? Math.min(100, Math.max(12, age)) : 26)}
                      className="text-3xl font-bold font-serif bg-transparent outline-none w-16 text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-gray-500 ml-1">岁</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="12"
                  max="100"
                  step="1"
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col h-full animate-fade-in">
            {/* Hidden Input for Custom Ideal Shape */}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={idealGalleryInputRef}
              onChange={handleIdealFileChange}
            />

            <div className="grid grid-cols-2 gap-4 flex-1 pb-4">
              {(gender === 'female' ? femaleStyles : maleStyles).map((style) => {
                const isSelected = bodyStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => setBodyStyle(style.id)}
                    className={`relative w-full rounded-2xl flex flex-col p-4 border transition-all duration-300 items-start ${isSelected
                      ? 'bg-gradient-to-t from-primary/10 to-transparent border-primary shadow-[0_0_20px_rgba(184,255,0,0.15)]'
                      : 'bg-white/5 border-transparent hover:bg-white/10'
                      }`}
                  >
                    {isSelected ? (
                      <span className="material-icons-round text-primary absolute top-3 right-3 text-lg">check_circle</span>
                    ) : (
                      <span className="material-icons-round text-white/30 absolute top-3 right-3 text-lg">info</span>
                    )}

                    <div className="w-full h-32 flex items-center justify-center mb-2">
                      {style.image ? (
                        <img src={style.image} alt={style.label} className={`w-full h-full object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all duration-300 ${isSelected ? 'scale-110 drop-shadow-[0_0_15px_rgba(184,255,0,0.5)]' : 'opacity-70'}`} />
                      ) : (
                        <svg width="40" height="80" viewBox="0 0 40 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all duration-300">
                          <circle cx="20" cy="16" r="10" fill={isSelected ? "#B8FF00" : "#6B7280"} />
                          <path d="M12 30 L28 30 L36 80 L4 80 Z" fill={isSelected ? "#B8FF00" : "#6B7280"} />
                        </svg>
                      )}
                    </div>

                    <span className={`text-base font-bold ${isSelected ? 'text-primary' : 'text-white'}`}>{style.label}</span>
                    <span className={`text-[10px] ${isSelected ? 'text-primary/70' : 'text-gray-500'}`}>{style.en}</span>
                  </button>
                );
              })}

              <button
                onClick={() => {
                  if (idealGalleryInputRef.current) idealGalleryInputRef.current.click();
                }}
                className={`relative w-full rounded-2xl flex flex-col items-center justify-center p-4 border-2 border-dashed transition-all duration-300 ${bodyStyle === 'custom'
                  ? 'border-primary bg-primary/5 shadow-[0_0_20px_rgba(184,255,0,0.15)]'
                  : 'border-white/10 hover:border-white/30'
                  }`}
              >
                {customIdealImage ? (
                  <img src={customIdealImage} alt="Custom Ideal" className="w-12 h-12 rounded-full mb-4 object-cover border-2 border-primary" />
                ) : (
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${bodyStyle === 'custom' ? 'bg-primary text-black' : 'bg-transparent text-primary border border-primary/30'}`}>
                    <span className="material-icons-round text-2xl">add</span>
                  </div>
                )}
                <span className="text-sm text-white mb-1 text-center">{customIdealImage ? "重新上传" : "上传我的\n理想型"}</span>
                <span className="text-[10px] text-gray-500">自定义目标</span>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="h-full flex flex-col flex-1 animate-fade-in">
            {/* Hidden Inputs */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              ref={cameraInputRef}
              onChange={(e) => handleFileChange(e)}
            />
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={galleryInputRef}
              onChange={(e) => handleFileChange(e)}
            />

            <div className="flex-1 glass rounded-[32px] border-dashed border-2 border-white/20 relative overflow-hidden mb-6 w-full group">
              {selectedImage ? (
                <img
                  src={selectedImage}
                  alt="Selected"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="absolute inset-0 bg-primary/5 animate-pulse-slow"></div>
                  <span className="material-icons-round text-6xl text-white/20 mb-4 relative z-10">center_focus_strong</span>
                  <p className="text-xs text-gray-400 tracking-widest relative z-10">请确保全身完整入镜</p>
                </div>
              )}

              {/* Simulated Scan Line (Overlay) */}
              <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-[0_0_20px_#B8FF00] animate-[float_3s_linear_infinite] pointer-events-none z-20" style={{ animationDuration: '2s' }}></div>
            </div>

            {/* Upload Tips */}
            {!selectedImage && (
              <div className="mb-4 text-center">
                <p className="text-xs text-gray-500 mb-1">推荐穿着紧身衣物</p>
                <p className="text-[10px] text-gray-600">光线充足 · 背景干净 · 姿势自然</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 shrink-0">
              <button
                onClick={triggerCamera}
                className="glass py-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
              >
                <span className="material-icons-round text-2xl">photo_camera</span>
                <span className="text-xs">拍照</span>
              </button>
              <button
                onClick={triggerGallery}
                className="glass py-4 rounded-2xl flex flex-col items-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
              >
                <span className="material-icons-round text-2xl">photo_library</span>
                <span className="text-xs">相册</span>
              </button>
            </div>
          </div>
        )
        }
      </main >

      <footer className="mt-6 shrink-0 z-20">
        <button
          onClick={() => step < 3 ? setStep(step + 1) : onComplete(selectedImage, true, gender, bodyStyle, customIdealImage)}
          disabled={(step === 2 && (!bodyStyle || (bodyStyle === 'custom' && !customIdealImage))) || (step === 3 && !selectedImage)}
          className={`w-full font-bold text-lg py-4 rounded-full shadow-[0_0_25px_rgba(184,255,0,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${((step === 2 && (!bodyStyle || (bodyStyle === 'custom' && !customIdealImage))) || (step === 3 && !selectedImage))
            ? 'bg-white/10 text-white/30 cursor-not-allowed shadow-none'
            : 'bg-primary hover:bg-primary-dark text-black'
            }`}
        >
          <span>{step === 3 ? "开始生成理想态" : "下一步"}</span>
          <span className="material-icons-round">arrow_forward</span>
        </button>
      </footer>
    </div >
  );
};

export default Onboarding;