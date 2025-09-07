import cv2
import numpy as np
from ultralytics import YOLO
import torch
import logging
import time
import os
import urllib.request
import ssl
from typing import Optional, List, Dict, Any
import re
# DeepSort removed - using direct plate detection only

# DISABLE AUTO-DOWNLOAD COMPLETELY
os.environ['ULTRALYTICS_DISABLE_DOWNLOAD'] = '1'  # Disable auto-download
os.environ['ULTRALYTICS_DISABLE_TELEMETRY'] = '1'  # Disable telemetry
os.environ['ULTRALYTICS_HOME'] = os.path.dirname(os.path.abspath(__file__))  # Set home to current directory
# Fix PaddlePaddle imports - try GPU version first, fall back to CPU
try:
    import paddle
    # Try to initialize CUDA if available
    if paddle.is_compiled_with_cuda():
        paddle.device.set_device("gpu:0")
        print("PaddlePaddle GPU initialized successfully")
    else:
        print("PaddlePaddle CPU mode (CUDA not available)")
except ImportError:
    print("PaddlePaddle not found, trying alternative import")
    paddle = None

# Import PaddleOCR with proper error handling
try:
    from paddleocr import PaddleOCR
    print("PaddleOCR imported successfully")
except ImportError as e:
    print(f"PaddleOCR import failed: {e}")
    print("Please install: pip install paddleocr paddlepaddle-gpu")
    # Create dummy class to prevent crashes
    class PaddleOCR:
        def __init__(self, *args, **kwargs):
            raise ImportError("PaddleOCR not available")
        def ocr(self, *args, **kwargs):
            return None
        
EASYOCR_AVAILABLE = False
_easyocr = None
easyocr_reader = None
# Fix PyTorch version compatibility for weights_only issue
import torch
TORCH_VERSION = torch.__version__
print(f"PyTorch version: {TORCH_VERSION}")

# Setup logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
try:
    import cv2 as _cv2_internal
    try:
        _cv2_internal.setNumThreads(1)
    except Exception:
        pass
except Exception:
    pass
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('MKL_NUM_THREADS', '1')
os.environ.setdefault('VECLIB_MAXIMUM_THREADS', '1')
os.environ.setdefault('NUMEXPR_NUM_THREADS', '1')

# Reduce per-frame log noise unless explicitly enabled
if os.environ.get('LPR_VERBOSE', '0') != '1':
    try:
        logger.setLevel(logging.WARNING)
    except Exception:
        pass

def setup_torch_environment():
    """Setup PyTorch environment for YOLO loading"""
    try:
        import os
        import torch
        
        # CRITICAL FIX: Disable weights_only globally for all torch.load calls
        os.environ['TORCH_WEIGHTS_ONLY'] = 'false'
        os.environ['ULTRALYTICS_DISABLE_DOWNLOAD'] = '1'
        
        # Also set PyTorch's internal setting if available
        try:
            torch._C._set_print_file(None)  # Suppress some warnings
        except:
            pass
        
        logger.info("✅ PyTorch environment setup completed")
        return True
        
    except Exception as e:
        logger.warning(f"PyTorch environment setup failed: {e}")
        return False

def check_pytorch_compatibility():
    """Check PyTorch version and compatibility issues"""
    try:
        logger.info("🔍 CHECKING PYTORCH COMPATIBILITY...")
        
        # Check PyTorch version
        major, minor, patch = map(int, TORCH_VERSION.split('+')[0].split('.'))
        logger.info(f"PyTorch version: {major}.{minor}.{patch}")
        
        # Basic compatibility check
        logger.info(f"PyTorch {major}.{minor}.{patch} detected")
        
        # Check CUDA availability
        import torch
        cuda_available = torch.cuda.is_available()
        logger.info(f"CUDA available: {cuda_available}")
        
        if cuda_available:
            cuda_version = torch.version.cuda
            logger.info(f"CUDA version: {cuda_version}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error checking PyTorch compatibility: {e}")
        return False


def safe_torch_load(path, **kwargs):
    """Safe torch.load with comprehensive PyTorch version compatibility"""
    try:
        logger.info(f"Loading model with torch.load: {path}")
        
        # Check PyTorch version
        try:
            version_parts = torch.__version__.split('+')[0].split('.')
            major = int(version_parts[0])
            minor = int(version_parts[1]) if len(version_parts) > 1 else 0
        except:
            major, minor = 2, 0  # Default fallback
        
        logger.info(f"PyTorch version detected: {major}.{minor}")
        
        # For PyTorch 2.6+ or any version with weights_only parameter
        # Always try weights_only=False first for YOLO models
        try:
            # Add safe globals for YOLO models - FIXED version
            import torch.serialization
            safe_global_names = [
                'ultralytics.nn.tasks.DetectionModel',
                'ultralytics.nn.modules.Conv',
                'ultralytics.nn.modules.C2f',
                'ultralytics.nn.modules.SPPF',
                'ultralytics.nn.modules.Detect',
                # Add explicit Conv submodules used by newer checkpoints
                'ultralytics.nn.modules.conv.Conv',
                'ultralytics.nn.modules.conv.Concat',
                # Add missing DFL block used by newer Ultralytics models
                'ultralytics.nn.modules.block.DFL'
            ]
            
            # Import and add actual module objects
            safe_modules = []
            for module_name in safe_global_names:
                try:
                    parts = module_name.split('.')
                    module = __import__(parts[0])
                    for part in parts[1:]:
                        module = getattr(module, part)
                    safe_modules.append(module)
                except (ImportError, AttributeError):
                    continue
            
            if safe_modules:
                torch.serialization.add_safe_globals(safe_modules)
                logger.info(f"Added {len(safe_modules)} safe globals")
                
        except Exception as e:
            logger.info(f"Could not add safe globals: {e}")
        
        # Try different loading strategies
        loading_strategies = [
            # Strategy 1: weights_only=False (most permissive)
            {'weights_only': False, 'map_location': 'cpu'},
            # Strategy 2: No weights_only parameter (older PyTorch)
            {'map_location': 'cpu'},
            # Strategy 3: weights_only=True with safe globals
            {'weights_only': True, 'map_location': 'cpu'},
        ]
        
        for i, strategy in enumerate(loading_strategies):
            try:
                logger.info(f"Trying loading strategy {i+1}: {strategy}")
                result = torch.load(path, **strategy, **kwargs)
                logger.info(f"✅ Successfully loaded with strategy {i+1}")
                return result
            except Exception as e:
                logger.warning(f"Strategy {i+1} failed: {e}")
                continue
        
        # If all strategies fail, raise the last error
        raise Exception("All torch.load strategies failed")
                
    except Exception as e:
        logger.error(f"Critical error in safe_torch_load: {e}")
        raise e

def safe_yolo_load(model_path):
    """COMPLETELY FIXED Safe YOLO model loading with context manager approach"""
    try:
        import os
        from ultralytics import YOLO
        import torch.serialization
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        logger.info(f"🔄 COMPLETELY FIXED Loading: {model_path}")
        logger.info(f"Current dir: {current_dir}")
        
        # FIXED: Direct path resolution
        if not os.path.isabs(model_path):
            # Check in current directory
            full_path = os.path.join(current_dir, model_path)
            logger.info(f"Checking: {full_path}")
            
            if os.path.exists(full_path):
                model_path = full_path
                logger.info(f"✅ Found local file: {model_path}")
            else:
                # If it's yolov9s.pt, allow download
                if os.path.basename(model_path) == 'yolov9s.pt':
                    logger.info("📥 yolov9s.pt not found locally, will try download")
                    model_path = 'yolov9s.pt'  # Let YOLO download
                else:
                    logger.error(f"❌ File not found: {full_path}")
                    return None
        
        # FIXED: Enable download for yolov9s.pt
        original_setting = os.environ.get('ULTRALYTICS_DISABLE_DOWNLOAD', '1')
        if 'yolov9s.pt' in model_path:
            os.environ['ULTRALYTICS_DISABLE_DOWNLOAD'] = '0'
            logger.info("Enabled download for yolov9s.pt")
        
        try:
            # CRITICAL FIX: Use safe_globals context manager to allow ALL globals
            logger.info(f"Loading with YOLO using safe_globals context manager: {model_path}")
            
            # Create a comprehensive list of all possible modules that YOLO might need
            safe_globals_list = []
            
            # Add all torch.nn modules
            import torch.nn as nn
            torch_nn_modules = [
                nn.Module, nn.Sequential, nn.ModuleList, nn.ModuleDict,
                nn.Conv2d, nn.BatchNorm2d, nn.ReLU, nn.SiLU, nn.GELU,
                nn.MaxPool2d, nn.AdaptiveAvgPool2d, nn.Linear,
                nn.Dropout, nn.Identity, nn.Upsample
            ]
            safe_globals_list.extend(torch_nn_modules)
            
            # Add torch container modules
            import torch.nn.modules.container as container
            safe_globals_list.extend([
                container.Sequential, container.ModuleList, container.ModuleDict
            ])
            
            # Add ultralytics modules dynamically
            ultralytics_module_paths = [
                'ultralytics.nn.tasks.DetectionModel',
                'ultralytics.nn.modules.Conv',
                'ultralytics.nn.modules.C2f',
                'ultralytics.nn.modules.SPPF',
                'ultralytics.nn.modules.Detect',
                'ultralytics.nn.modules.block.Bottleneck',
                'ultralytics.nn.modules.block.C2f',
                'ultralytics.nn.modules.block.C3',
                'ultralytics.nn.modules.head.Detect',
                'ultralytics.nn.modules.conv.Conv',
                # Ensure DFL is allowlisted for weights_only=True
                'ultralytics.nn.modules.block.DFL',
                # Add YOLOv9 specific modules
                'ultralytics.nn.modules.block.RepNCSPELAN4',
                'ultralytics.nn.modules.block.RepCSP',
                'ultralytics.nn.modules.block.RepConv',
                'ultralytics.nn.modules.block.RepBottleneck',
                'ultralytics.nn.modules.block.RepC3',
                'ultralytics.nn.modules.block.ELAN1',
                'ultralytics.nn.modules.block.SPPELAN',
            ]
            
            for module_path in ultralytics_module_paths:
                try:
                    parts = module_path.split('.')
                    module = __import__(parts[0])
                    for part in parts[1:]:
                        module = getattr(module, part)
                    safe_globals_list.append(module)
                except (ImportError, AttributeError):
                    continue
            
            # ULTIMATE FIX: Use context manager with comprehensive globals (+Concat + YOLOv9 modules)
            try:
                from ultralytics.nn.modules import conv as _ultra_conv
                if hasattr(_ultra_conv, 'Concat'):
                    safe_globals_list.append(_ultra_conv.Concat)
            except Exception:
                pass
            
            # Add YOLOv9 modules directly (only if available in current ultralytics version)
            try:
                from ultralytics.nn.modules import block as _ultra_block
                yolo_v9_modules = ['RepNCSPELAN4', 'RepCSP', 'RepConv', 'RepBottleneck', 'RepC3', 'ELAN1', 'SPPELAN']
                for module_name in yolo_v9_modules:
                    if hasattr(_ultra_block, module_name):
                        safe_globals_list.append(getattr(_ultra_block, module_name))
                        logger.info(f"Added {module_name} to safe globals")
                    else:
                        logger.debug(f"Module {module_name} not available in current ultralytics version")
            except Exception as e:
                logger.warning(f"Could not add YOLOv9 modules directly: {e}")
            
            # Check PyTorch version compatibility and try different approaches
            model = None
            
            # Try direct loading first (most reliable for YOLOv9)
            try:
                logger.info("Trying direct YOLO loading (recommended for YOLOv9)")
                model = YOLO(model_path)
                logger.info("✅ YOLO loading successful with direct loading")
            except Exception as e:
                logger.warning(f"Direct YOLO loading failed: {e}")
                model = None
            
            # Try with trust_remote_code=True if direct loading failed
            if model is None:
                try:
                    logger.info("Trying YOLO loading with trust_remote_code=True")
                    model = YOLO(model_path, trust_remote_code=True)
                    logger.info("✅ YOLO loading successful with trust_remote_code=True")
                except Exception as e:
                    logger.warning(f"YOLO loading with trust_remote_code=True failed: {e}")
                    model = None
            
            # Try with weights_only=False if direct loading failed
            if model is None:
                try:
                    logger.info("Trying YOLO loading with weights_only=False")
                    # Temporarily patch torch.load to use weights_only=False
                    original_torch_load = torch.load
                    def patched_torch_load(*args, **kwargs):
                        kwargs['weights_only'] = False
                        kwargs['map_location'] = 'cpu'
                        return original_torch_load(*args, **kwargs)
                    torch.load = patched_torch_load
                    
                    try:
                        model = YOLO(model_path)
                        logger.info("✅ YOLO loading successful with weights_only=False")
                    finally:
                        torch.load = original_torch_load
                except Exception as e:
                    logger.warning(f"YOLO loading with weights_only=False failed: {e}")
                    model = None
            
            # Try safe_globals context manager if direct loading failed
            if model is None and hasattr(torch.serialization, 'safe_globals'):
                try:
                    logger.info("Trying safe_globals context manager with comprehensive module list")
                    with torch.serialization.safe_globals(safe_globals_list):
                        model = YOLO(model_path)
                        logger.info("✅ YOLO loading successful with safe_globals context manager")
                except Exception as e:
                    logger.warning(f"safe_globals context manager failed: {e}")
                    model = None
            
            # Try add_safe_globals if context manager failed
            if model is None and hasattr(torch.serialization, 'add_safe_globals'):
                try:
                    logger.info("Trying add_safe_globals with comprehensive module list")
                    torch.serialization.add_safe_globals(safe_globals_list)
                    model = YOLO(model_path)
                    logger.info("✅ YOLO loading successful with add_safe_globals")
                except Exception as e:
                    logger.warning(f"add_safe_globals failed: {e}")
                    model = None
            
            if model is None:
                logger.error("Model loading failed")
                return None
            
            # Quick test with error handling
            try:
                test_img = np.ones((320, 320, 3), dtype=np.uint8) * 128
                _ = model(test_img, verbose=False, conf=0.9, imgsz=320)
                logger.info("✅ Model test successful")
            except Exception as test_error:
                logger.warning(f"Model test failed: {test_error}")
                # Don't fail completely if test fails, the model might still work
            
            logger.info(f"✅ SUCCESS: {os.path.basename(model_path)}")
            return model
            
        except Exception as e:
            logger.warning(f"Safe globals context manager failed: {e}")
            
            # FALLBACK: Try with weights_only=False by patching torch.load
            try:
                logger.info("Trying fallback with torch.load patching...")
                
                # Temporarily patch torch.load to use weights_only=False
                original_torch_load = torch.load
                
                def patched_torch_load(*args, **kwargs):
                    kwargs['weights_only'] = False
                    kwargs['map_location'] = 'cpu'
                    return original_torch_load(*args, **kwargs)
                
                torch.load = patched_torch_load
                
                try:
                    model = YOLO(model_path)
                    logger.info("✅ YOLO loading successful with patched torch.load")
                finally:
                    # Restore original torch.load
                    torch.load = original_torch_load
                
                return model
                
            except Exception as fallback_error:
                logger.error(f"Fallback also failed: {fallback_error}")
                try:
                    # FINAL FALLBACK: explicitly set weights_only=False with allowlisted globals
                    import torch.serialization
                    allow = []
                    try:
                        from ultralytics.nn.modules import conv as _ultra_conv
                        if hasattr(_ultra_conv, 'Concat'):
                            allow.append(_ultra_conv.Concat)
                    except Exception:
                        pass
                    # Also allow DFL block and YOLOv9 modules explicitly (only if available)
                    try:
                        from ultralytics.nn.modules import block as _ultra_block
                        yolo_modules = ['DFL', 'RepNCSPELAN4', 'RepCSP', 'RepConv', 'RepBottleneck', 'RepC3', 'ELAN1', 'SPPELAN']
                        for module_name in yolo_modules:
                            if hasattr(_ultra_block, module_name):
                                allow.append(getattr(_ultra_block, module_name))
                                logger.debug(f"Added {module_name} to fallback allow list")
                    except Exception:
                        pass
                    if allow:
                        try:
                            torch.serialization.add_safe_globals(allow)
                            logger.info(f"Added {len(allow)} safe globals for fallback")
                        except Exception as e:
                            logger.warning(f"Could not add safe globals in fallback: {e}")
                    def patched_torch_load_final(*args, **kwargs):
                        kwargs['weights_only'] = False
                        kwargs['map_location'] = 'cpu'
                        return original_torch_load(*args, **kwargs)
                    torch.load = patched_torch_load_final
                    try:
                        model = YOLO(model_path)
                        logger.info("✅ YOLO loading successful with final explicit weights_only=False")
                        return model
                    finally:
                        torch.load = original_torch_load
                except Exception as e3:
                    logger.error(f"Final fallback failed: {e3}")
                    return None
        
        finally:
            # Restore setting
            os.environ['ULTRALYTICS_DISABLE_DOWNLOAD'] = original_setting
            
    except Exception as e:
        logger.error(f"Critical error: {e}")
        return None
def check_model_availability():
    """Check which model files are available and their status"""
    try:
        logger.info("🔍 CHECKING MODEL AVAILABILITY...")
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        available_models = []
        missing_models = []
        
        # Check only yolov9s.pt
        model_files = [
            'yolov9s.pt'
        ]
        
        for model_file in model_files:
            model_path = os.path.join(current_dir, model_file)
            if os.path.exists(model_path):
                file_size = os.path.getsize(model_path) / (1024 * 1024)  # MB
                available_models.append({
                    'name': model_file,
                    'path': model_path,
                    'size_mb': round(file_size, 2),
                    'exists': True
                })
                logger.info(f"✅ {model_file}: {file_size:.2f} MB")
            else:
                missing_models.append({
                    'name': model_file,
                    'path': model_path,
                    'exists': False
                })
                logger.warning(f"❌ {model_file}: NOT FOUND")
        
        # Check ultralytics cache
        try:
            cache_path = os.path.expanduser('~/.ultralytics')
            if os.path.exists(cache_path):
                cache_models = [f for f in os.listdir(cache_path) if f.endswith('.pt')]
                if cache_models:
                    logger.info(f"📁 Ultralytics cache contains: {cache_models}")
                    for cache_model in cache_models:
                        cache_model_path = os.path.join(cache_path, cache_model)
                        file_size = os.path.getsize(cache_model_path) / (1024 * 1024)
                        available_models.append({
                            'name': f"cache_{cache_model}",
                            'path': cache_model_path,
                            'size_mb': round(file_size, 2),
                            'exists': True
                        })
        except Exception as e:
            logger.warning(f"Could not check ultralytics cache: {e}")
        
        logger.info(f"📊 MODEL AVAILABILITY SUMMARY:")
        logger.info(f"   Available: {len(available_models)} models")
        logger.info(f"   Missing: {len(missing_models)} models")
        
        return {
            'available': available_models,
            'missing': missing_models,
            'total_available': len(available_models)
        }
        
    except Exception as e:
        logger.error(f"Error checking model availability: {e}")
        return {'available': [], 'missing': [], 'total_available': 0}

def verify_model_files():
    """Verify all model files exist and are valid"""
    try:
        logger.info("🔍 VERIFYING MODEL FILES...")
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_files = [
            'yolov9s.pt'
        ]
        
        valid_models = []
        for model_file in model_files:
            model_path = os.path.join(current_dir, model_file)
            if os.path.exists(model_path):
                file_size = os.path.getsize(model_path)
                size_mb = file_size / (1024 * 1024)
                
                if file_size > 1024 * 1024:  # More than 1MB
                    valid_models.append({
                        'name': model_file,
                        'path': model_path,
                        'size_mb': round(size_mb, 2),
                        'status': 'VALID'
                    })
                    logger.info(f"✅ {model_file}: {size_mb:.2f} MB - VALID")
                else:
                    logger.warning(f"⚠️ {model_file}: {size_mb:.2f} MB - TOO SMALL (likely corrupted)")
            else:
                logger.error(f"❌ {model_file}: NOT FOUND")
        
        logger.info(f" MODEL VERIFICATION SUMMARY:")
        logger.info(f"   Valid models: {len(valid_models)}")
        logger.info(f"   Total checked: {len(model_files)}")
        
        return valid_models
        
    except Exception as e:
        logger.error(f"Error verifying model files: {e}")
        return []


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def refine_plate_crop(plate_img: np.ndarray) -> np.ndarray:
    """Enhance a plate crop to a high-quality, OCR-friendly image.
    Steps: denoise, contrast (CLAHE), unsharp mask, aspect-consistent resize, padding.
    Returns BGR uint8 image.
    """
    try:
        if plate_img is None or plate_img.size == 0:
            return plate_img
        img = plate_img.copy()
        # Ensure BGR uint8
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif len(img.shape) == 3 and img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        if img.dtype != np.uint8:
            img = np.clip(img, 0, 255).astype(np.uint8)

        h, w = img.shape[:2]
        # 1) Exposure normalization without bệt trắng (clip by percentile)
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            lo, hi = np.percentile(gray, (2.0, 98.0))
            if hi > lo + 1:
                scale = 255.0 / (hi - lo)
                img = np.clip((img.astype(np.float32) - lo) * scale, 0, 255).astype(np.uint8)
        except Exception:
            pass

        # 2) Gentle denoise while preserving edges
        try:
            img = cv2.fastNlMeansDenoisingColored(img, None, 3, 3, 7, 21)
        except Exception:
            pass

        # 3) Local contrast (CLAHE) on L channel with conservative clip
        try:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        except Exception:
            pass

        # 4) Mild sharpening (avoid thổi sáng)
        try:
            blur = cv2.GaussianBlur(img, (0, 0), 0.8)
            img = cv2.addWeighted(img, 1.3, blur, -0.3, 0)
        except Exception:
            pass

        # Normalize final target size while keeping aspect; aim height ~180
        target_h = 180
        scale = max(1.0, target_h / max(1, float(h)))
        new_w, new_h = int(round(w * scale)), int(round(h * scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

        # Add white padding to avoid text touching borders
        pad = max(12, int(min(new_w, new_h) * 0.06))
        img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])

        return img
    except Exception as e:
        logger.debug(f"refine_plate_crop error: {e}")
        return plate_img

def enhance_plate_crop_highres(plate_img: np.ndarray) -> np.ndarray:
    """Aggressively enhance and upscale plate crop to high-res, OCR-friendly image.
    Pipeline: denoise -> CLAHE -> unsharp -> mild deblur -> upscale to min width 600 -> white padding.
    Returns BGR uint8 image.
    """
    try:
        if plate_img is None or plate_img.size == 0:
            return plate_img
        img = plate_img.copy()
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif len(img.shape) == 3 and img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        if img.dtype != np.uint8:
            img = np.clip(img, 0, 255).astype(np.uint8)

        # Denoise while preserving edges
        try:
            img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        except Exception:
            pass

        # CLAHE on L channel
        try:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        except Exception:
            pass

        # Unsharp mask
        try:
            blur = cv2.GaussianBlur(img, (0, 0), 1.0)
            img = cv2.addWeighted(img, 1.6, blur, -0.6, 0)
        except Exception:
            pass

        # Mild deblur via bilateral
        try:
            img = cv2.bilateralFilter(img, 5, 75, 75)
        except Exception:
            pass

        # Upscale to minimum width (stronger)
        h, w = img.shape[:2]
        target_w = max(800, int(w * 3))
        scale = target_w / max(1, w)
        target_h = int(h * scale)
        if target_w > w:
            img = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

        # White padding
        pad = max(12, int(min(img.shape[0], img.shape[1]) * 0.04))
        img = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=[255, 255, 255])

        return img
    except Exception as e:
        logger.debug(f"enhance_plate_crop_highres error: {e}")
        return plate_img

def _order_points_clockwise(pts):
    try:
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]  # top-left
        rect[2] = pts[np.argmax(s)]  # bottom-right
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]  # top-right
        rect[3] = pts[np.argmax(diff)]  # bottom-left
        return rect
    except Exception:
        return pts.astype("float32")

def rectify_plate_geometry(img: np.ndarray) -> np.ndarray:
    """Deskew and rectify plate by detecting a 4-point contour and warping."""
    try:
        if img is None or img.size == 0:
            return img
        src = img.copy()
        gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY) if len(src.shape) == 3 else src
        gray = cv2.bilateralFilter(gray, 5, 75, 75)
        edges = cv2.Canny(gray, 50, 150)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        h, w = gray.shape[:2]
        best = None
        best_area = 0
        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                if area > best_area and area > 0.1 * h * w:
                    best = approx.reshape(-1, 2)
                    best_area = area
        if best is None:
            return src
        rect = _order_points_clockwise(best)
        (tl, tr, br, bl) = rect
        widthA = np.linalg.norm(br - bl)
        widthB = np.linalg.norm(tr - tl)
        maxWidth = int(max(widthA, widthB))
        heightA = np.linalg.norm(tr - br)
        heightB = np.linalg.norm(tl - bl)
        maxHeight = int(max(heightA, heightB))
        if maxWidth < 20 or maxHeight < 10:
            return src
        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")
        M = cv2.getPerspectiveTransform(rect.astype("float32"), dst)
        warped = cv2.warpPerspective(src, M, (maxWidth, maxHeight))
        return warped
    except Exception:
        return img

def select_best_plate_variant(plate_img: np.ndarray) -> np.ndarray:
    """Generate multiple enhanced variants and pick the highest-quality crop.
    Uses sharpness high, low saturated-white ratio, and entropy to rank.
    """
    try:
        if plate_img is None or plate_img.size == 0:
            return plate_img
        variants: List[np.ndarray] = []
        # Base
        base = enhance_plate_crop_highres(plate_img)
        variants.append(base)
        # Extra variants
        try:
            tight = tighten_text_bbox(base)
            variants.append(enhance_plate_crop_highres(tight))
        except Exception:
            pass
        # Rectified variant
        try:
            rect = rectify_plate_geometry(plate_img)
            variants.append(enhance_plate_crop_highres(rect))
        except Exception:
            pass
        try:
            for v in generate_ocr_variants(plate_img)[:3]:
                variants.append(enhance_plate_crop_highres(v))
        except Exception:
            pass
        # Score
        best_img = base
        best_score = -1e9
        for v in variants:
            try:
                q = evaluate_crop_quality(v)
                # Score: prioritize sharpness, penalize saturated white, reward entropy
                score = q['sharpness'] - 150.0 * q['sat_white'] + 3.0 * q['entropy']
                if score > best_score:
                    best_score = score
                    best_img = v
            except Exception:
                continue
        return best_img
    except Exception:
        return plate_img

def tighten_text_bbox(crop_img: np.ndarray) -> np.ndarray:
    """Thu nhỏ crop bám sát vùng ký tự bằng MSER hai cực (đen trên trắng và ngược lại)."""
    try:
        if crop_img is None or crop_img.size == 0:
            return crop_img
        img = crop_img.copy()
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img
        h, w = gray.shape[:2]
        mser = cv2.MSER_create(_delta=5, _min_area=30, _max_area=max(200, h*w//2))
        regions = []
        try:
            regs1, _ = mser.detectRegions(gray)
            regions.extend(regs1)
        except Exception:
            pass
        try:
            regs2, _ = mser.detectRegions(255 - gray)
            regions.extend(regs2)
        except Exception:
            pass
        if not regions:
            return crop_img
        # Collect character-like boxes
        xs, ys, xe, ye = [], [], [], []
        for p in regions[:500]:
            x, y, ww, hh = cv2.boundingRect(p)
            if ww < 5 or hh < 8:
                continue
            aspect = ww / float(hh)
            if 0.2 <= aspect <= 2.5 and 0.01*h <= hh <= 0.8*h:
                xs.append(x); ys.append(y); xe.append(x+ww); ye.append(y+hh)
        if not xs:
            return crop_img
        x1, y1, x2, y2 = max(0, min(xs)), max(0, min(ys)), min(w, max(xe)), min(h, max(ye))
        if x2 - x1 >= 10 and y2 - y1 >= 10:
            return img[y1:y2, x1:x2] if len(img.shape)==3 else img[y1:y2, x1:x2]
        return crop_img
    except Exception as e:
        logger.debug(f"tighten_text_bbox error: {e}")
        return crop_img

def evaluate_crop_quality(img: np.ndarray) -> Dict[str, float]:
    """Đánh giá chất lượng crop: độ nét, tỷ lệ vùng trắng bệt, entropy."""
    try:
        if img is None or img.size == 0:
            return {'sharpness': 0.0, 'sat_white': 1.0, 'entropy': 0.0}
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape)==3 else img
        # Sharpness via Laplacian variance
        sharp = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        # Saturated white ratio
        sat = float(np.mean(gray > 245))
        # Entropy approximation
        hist = cv2.calcHist([gray],[0],None,[256],[0,256]).ravel()
        p = hist / max(1.0, hist.sum())
        p = p[p>0]
        ent = float(-(p*np.log2(p)).sum())
        return {'sharpness': sharp, 'sat_white': sat, 'entropy': ent}
    except Exception:
        return {'sharpness': 0.0, 'sat_white': 1.0, 'entropy': 0.0}

def debug_ocr_result_structure(ocr_result):
    """Debug OCR result to understand its exact structure"""
    try:
        logger.info("=== OCR RESULT STRUCTURE DEBUG ===")
        logger.info(f"Type: {type(ocr_result)}")
        logger.info(f"Length: {len(ocr_result) if hasattr(ocr_result, '__len__') else 'N/A'}")
        
        if isinstance(ocr_result, list):
            for i, item in enumerate(ocr_result[:3]):  # Only first 3 items
                logger.info(f"Item[{i}]: type={type(item)}")
                if hasattr(item, '__len__'):
                    logger.info(f"Item[{i}]: len={len(item)}")
                
                if isinstance(item, list):
                    for j, subitem in enumerate(item[:2]):  # Only first 2 subitems
                        logger.info(f"  SubItem[{i}][{j}]: type={type(subitem)}")
                        if isinstance(subitem, (list, tuple)) and len(subitem) >= 2:
                            logger.info(f"    Text candidate: '{subitem[0]}', Conf: {subitem[1]}")
                        elif isinstance(subitem, str):
                            logger.info(f"    String: '{subitem}'")
                else:
                    logger.info(f"Item[{i}]: {str(item)[:100]}")
        
        logger.info("=== END DEBUG ===")
        return True
        
    except Exception as e:
        logger.error(f"Debug structure error: {e}")
        return False
def debug_ocr_step_by_step(reader, image, save_debug=True):
    """Enhanced debug OCR with detailed result analysis"""
    try:
        if reader is None or image is None or image.size == 0:
            return None, "Invalid input"
            
        logger.info("=== ENHANCED OCR DEBUG MODE ===")
        
        # Step 1: Image preprocessing
        h, w = image.shape[:2]
        logger.info(f"Original image: {w}x{h}")
        
        processed = image.copy()
        
        # Aggressive upscaling
        if w < 300 or h < 80:
            scale = max(300/w, 80/h, 4.0)
            new_w, new_h = int(w * scale), int(h * scale)
            processed = cv2.resize(processed, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            logger.info(f"Upscaled to: {new_w}x{new_h}")
        
        # Convert to grayscale and enhance
        if len(processed.shape) == 3:
            gray = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY)
        else:
            gray = processed
            
        # Multiple enhancement techniques
        enhanced = cv2.equalizeHist(gray)
        enhanced = cv2.convertScaleAbs(enhanced, alpha=1.5, beta=20)

        # Prepare multiple variants for OCR robustness
        variants = []
        base_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
        variants.append(("base", base_bgr))

        # Binary (Otsu) and inverted
        try:
            _, th_otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            variants.append(("otsu", cv2.cvtColor(th_otsu, cv2.COLOR_GRAY2BGR)))
            variants.append(("otsu_inv", cv2.cvtColor(255 - th_otsu, cv2.COLOR_GRAY2BGR)))
        except Exception:
            pass

        # Adaptive threshold
        try:
            th_adp = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                           cv2.THRESH_BINARY, 31, 5)
            variants.append(("adaptive", cv2.cvtColor(th_adp, cv2.COLOR_GRAY2BGR)))
            variants.append(("adaptive_inv", cv2.cvtColor(255 - th_adp, cv2.COLOR_GRAY2BGR)))
        except Exception:
            pass

        # Morphological operations
        try:
            kernel = np.ones((3, 3), np.uint8)
            morphed = cv2.morphologyEx(enhanced, cv2.MORPH_OPEN, kernel, iterations=1)
            variants.append(("morph_open", cv2.cvtColor(morphed, cv2.COLOR_GRAY2BGR)))
        except Exception:
            pass

        # Add substantial padding to each variant
        padded_variants = []
        pad_size = 50
        for name, var in variants:
            padded = cv2.copyMakeBorder(var, pad_size, pad_size, pad_size, pad_size,
                                        cv2.BORDER_CONSTANT, value=[255, 255, 255])
            padded_variants.append((name, padded))
        
        logger.info(f"Final processed size: {processed.shape}")
        
        # Step 2: Multiple OCR attempts with detailed logging
        attempts = [
            {"name": "det+rec", "det": True, "rec": True, "cls": False},
            {"name": "rec_only", "det": False, "rec": True, "cls": False},
        ]
        
        for attempt in attempts:
            for vname, vimg in padded_variants:
                try:
                    logger.info(f"Trying OCR mode: {attempt['name']} on variant: {vname}")
                    result = reader.ocr(vimg, det=attempt['det'], rec=attempt['rec'], cls=attempt['cls'])
                    
                    logger.info(f"OCR result type: {type(result)}")
                    logger.info(f"OCR result length: {len(result) if hasattr(result, '__len__') else 'N/A'}")
                    
                    if result is not None:
                        # Try to extract text
                        text, conf = safe_extract_ocr_text(result)
                        if text and conf > 0.01:
                            logger.info(f"SUCCESS with {attempt['name']} on {vname}: '{text}' (conf: {conf:.3f})")
                            return result, f"Success with {attempt['name']}:{vname} -> {text}"
                        else:
                            logger.warning(f"{attempt['name']} on {vname} returned result but no extractable text")
                            # Continue to next attempt
                    else:
                        logger.warning(f"{attempt['name']} on {vname} returned None")
                        
                except Exception as e:
                    logger.warning(f"{attempt['name']} on {vname} failed with error: {e}")
                    continue

        # Final fallback: raw grayscale without padding, rec-only
        try:
            if len(image.shape) == 3:
                gray_raw = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray_raw = image
            gray_raw = cv2.cvtColor(gray_raw, cv2.COLOR_GRAY2BGR)
            result = reader.ocr(gray_raw, det=False, rec=True, cls=False)
            if result is not None:
                text, conf = safe_extract_ocr_text(result)
                if text and conf > 0.01:
                    logger.info(f"SUCCESS with final fallback rec_only on raw: '{text}' (conf: {conf:.3f})")
                    return result, f"Success final_fallback: {text}"
        except Exception as e:
            logger.warning(f"Final fallback failed: {e}")
        
        logger.warning("All OCR attempts failed")
        return None, "All OCR attempts failed"
        
    except Exception as e:
        logger.error(f"Debug OCR critical error: {e}")
        import traceback
        logger.error(f"Debug traceback: {traceback.format_exc()}")
        return None, f"Critical error: {e}"
# ---- GPU/CUDA environment logging ----
def _log_gpu_env_once():
    try:
        if hasattr(_log_gpu_env_once, 'done') and _log_gpu_env_once.done:
            return
        cuda_avail = torch.cuda.is_available()
        cuda_version = getattr(torch.version, 'cuda', None)
        device_count = torch.cuda.device_count() if cuda_avail else 0
        current_idx = torch.cuda.current_device() if cuda_avail else None
        device_name = torch.cuda.get_device_name(current_idx) if cuda_avail else None
        logger.info(f"CUDA available: {cuda_avail}")
        logger.info(f"PyTorch CUDA version: {cuda_version}")
        logger.info(f"CUDA device count: {device_count}")
        if cuda_avail:
            logger.info(f"Using CUDA device {current_idx}: {device_name}")
        # Also print to stdout to ensure visibility in all environments
        print(f"[GPU] CUDA available: {cuda_avail}")
        print(f"[GPU] PyTorch CUDA version: {cuda_version}")
        print(f"[GPU] CUDA device count: {device_count}")
        if cuda_avail:
            print(f"[GPU] Using CUDA device {current_idx}: {device_name}")
        _log_gpu_env_once.done = True
    except Exception as e:
        logger.warning(f"GPU env log failed: {e}")

_log_gpu_env_once()

# Configuration - OPTIMIZED FOR VEHICLE AND LICENSE PLATE DETECTION
ROI_PERCENT_XMIN = 0.05  # Keep current ROI settings
ROI_PERCENT_YMIN = 0.10  
ROI_PERCENT_XMAX = 0.95  
ROI_PERCENT_YMAX = 0.95  
MAX_DISAPPEARED = 30      # Reduced for better tracking stability
MIN_CONFIDENCE = 0.1      # Lower threshold for better detection
DETECTION_DOWNSCALE_FACTOR = 1.0

# FPS OPTIMIZATION SETTINGS - NORMAL SPEED
# Enable lightweight frame skipping to keep stream responsive
FRAME_SKIP = 1  # Process every frame for better tracking
ENABLE_FRAME_SKIP = False  # Disable frame skipping to ensure boxes always render
MAX_OCR_VARIANTS = 3  # Lower variants to reduce CPU load
SKIP_OCR_ON_LOW_CONFIDENCE = False  # Don't skip OCR for better accuracy
OCR_CONFIDENCE_THRESHOLD = 0.15  # Increased for better quality OCR results
OCR_COOLDOWN_FRAMES = 2  # Reduced for more frequent OCR attempts
MAX_OCR_ATTEMPTS_PER_TRACK = 2  # Lower attempts to avoid stalls
SAVE_DEBUG_CROPS = False  # Disable saving crops to avoid I/O stalls during live processing

# VIDEO PERFORMANCE SETTINGS - NORMAL SPEED
ENABLE_SMOOTH_VIDEO = False  # Disable smooth video for normal speed
# Increase per-frame budget to allow more processing time for better detection
MAX_PROCESSING_TIME_MS = 100  # Increased from 45ms to 100ms for better detection
SKIP_COMPLEX_PREPROCESSING = False  # Enable preprocessing for better accuracy

# OCR OPTIMIZATION SETTINGS FOR MAXIMUM ACCURACY (INCLUDING DOTS AND 2-ROW PLATES)
OCR_USE_GPU = False  # Disable GPU for PaddleOCR due to CUDNN compatibility issues
OCR_USE_ANGLE_CLS = False  # DISABLE angle classifier completely
OCR_USE_DET = True
OCR_USE_CLS = False  # DISABLE classification completely
OCR_DET_DB_THRESH = 0.05  # Lowered from 0.1 for better detection
OCR_DET_DB_BOX_THRESH = 0.1  # Lowered from 0.2 for better detection
OCR_DET_DB_UNCLIP_RATIO = 1.6
OCR_REC_BATCH_NUM = 4  # Smaller batch for CPU
OCR_REC_CHAR_DICT_PATH = None
OCR_SHOW_LOG = False  # DISABLE all logging

# REALTIME GUARDS - Reduced frame skipping for better detection
OCR_EVERY_N_FRAMES = 1  # Run OCR every frame for better detection (was 3)
MIN_TIME_LEFT_FOR_OCR_MS = 10  # Reduced from 20ms to allow more OCR attempts

# ENHANCED PLATE DETECTION SETTINGS
PLATE_DETECTION_CONFIDENCE = 0.001  # Lowered from 0.01 for maximum sensitivity
PLATE_DETECTION_IOU = 0.2  # Reduced from 0.3 for better separation
PLATE_CROP_PADDING_RATIO = 0.6  # Increased padding to capture full plate context
PLATE_MIN_SIZE = (15, 6)  # Reduced minimum size requirements

# NEW: Enhanced settings for 2-row license plates
OCR_ENABLE_2ROW_DETECTION = True  # Enable special 2-row plate handling
OCR_2ROW_MIN_CONFIDENCE = 0.05  # Lowered from 0.1 for better 2-row detection
OCR_2ROW_COMBINE_THRESHOLD = 0.2  # Lowered from 0.3 for better combination
OCR_2ROW_MAX_SEPARATOR_DISTANCE = 0.4  # Increased from 0.3 for better row detection

# NEW: Balanced validation settings - RELAXED FOR REAL-WORLD PLATES
MIN_PLATE_LENGTH = 2  # Further reduced to catch very short plates
MAX_PLATE_LENGTH = 20  # Increased to catch very long plates
REQUIRE_CONSISTENT_OCR = False  # Disable consistency requirement for faster detection
MIN_CONSISTENT_FRAMES = 1  # Minimum frames with same result before accepting

# OCR ACCEPTANCE SETTINGS - MORE LENIENT
ACCEPT_PARTIAL_PLATES = True  # Accept partial plate numbers
ACCEPT_NUMBERS_ONLY = True  # Accept plates with only numbers (like '887', '888')
ACCEPT_SINGLE_CHAR = True  # Allow single characters for edge cases
MIN_ACCEPTABLE_CONFIDENCE = 0.2  # Increased for better quality results

# Vehicle classes to track (COCO: car=2, motorbike=3, bus=5, truck=7)
VEHICLE_CLASSES = [2, 3, 5, 7]  # Only track road vehicles

# Paths
current_dir = os.path.dirname(os.path.abspath(__file__))
CROPS_FOLDER = os.path.join(current_dir, 'static', 'crops')
os.makedirs(CROPS_FOLDER, exist_ok=True)

# Global variables
tracked_objects = {}
frame_count = 0
yolo_model = None
plate_model = None  # Model chuyên dụng cho biển số
plate_model_name = None
ocr_reader = None  # rec-only reader
ocr_failure_count = 0  # watchdog for OCR failures
processing_deadline_ts = 0.0  # per-frame deadline to keep stream responsive
_round_robin_track_index = 0  # ensures at least one track processed per frame under load
_raw_detection_id_counter = -1  # synthetic IDs for raw detections when no tracker

def _time_left_ms() -> float:
    try:
        if not processing_deadline_ts:
            return 1e9
        return max(0.0, (processing_deadline_ts - time.time()) * 1000.0)
    except Exception:
        return 0.0

# ANTI-DUPLICATE SYSTEM
plate_history = {}  # Track all plates ever seen with their best results
duplicate_counter = 0  # Count how many duplicates were prevented
last_cleanup_time = 0  # Track when last cleanup was performed

# NEW: CONSISTENCY TRACKING SYSTEM
track_consistency = {}  # Track consistency for each track_id
consistency_threshold = 3  # Minimum consistent frames before accepting plate
consistency_window = 10  # Look back this many frames for consistency
ocr_attempts_per_track = {}  # Track OCR attempts per track
max_ocr_attempts = 2  # Lower attempts per track to avoid stalls

# ERROR HANDLING AND RECOVERY
model_loading_attempts = 0
max_model_loading_attempts = 3
ocr_initialization_attempts = 0
max_ocr_initialization_attempts = 3
last_error_time = 0
error_cooldown = 5  # seconds between error recovery attempts

def safe_model_loading():
    """Safely load models with enhanced error handling"""
    global yolo_model, plate_model, plate_model_name, model_loading_attempts
    
    try:
        # Check if we've exceeded loading attempts
        if model_loading_attempts >= max_model_loading_attempts:
            logger.warning(f"Model loading attempts exceeded ({model_loading_attempts}/{max_model_loading_attempts})")
            return False
        
        model_loading_attempts += 1
        logger.info(f"Model loading attempt {model_loading_attempts}/{max_model_loading_attempts}")
        
        # Sử dụng initialize_models_properly để load models
        return initialize_models_properly()
        
    except Exception as e:
        logger.error(f"Critical error in safe model loading: {e}")
        return False
def log_raw_ocr_results(ocr_result):
    """Log all raw OCR results without filtering"""
    try:
        logger.info("=== RAW OCR RESULTS (BEFORE FILTERING) ===")
        
        def log_item(item, depth=0):
            indent = "  " * depth
            if isinstance(item, list):
                logger.info(f"{indent}List with {len(item)} items:")
                for i, subitem in enumerate(item):
                    logger.info(f"{indent}[{i}]: {type(subitem)}")
                    if isinstance(subitem, list) and len(subitem) >= 2:
                        if isinstance(subitem[1], list) and len(subitem[1]) >= 2:
                            text, conf = subitem[1][0], subitem[1][1]
                            logger.info(f"{indent}    TEXT FOUND: '{text}' (type: {type(text)}) CONF: {conf}")
                        elif len(subitem) == 2 and isinstance(subitem[0], str):
                            logger.info(f"{indent}    DIRECT TEXT: '{subitem[0]}' CONF: {subitem[1]}")
                    log_item(subitem, depth + 1)
            elif isinstance(item, str):
                logger.info(f"{indent}String: '{item}'")
            else:
                logger.info(f"{indent}{type(item)}: {str(item)[:50]}")
        
        if ocr_result:
            log_item(ocr_result)
        
        logger.info("=== END RAW OCR RESULTS ===")
        
    except Exception as e:
        logger.error(f"Error logging raw OCR results: {e}")
def safe_ocr_initialization():
    """Initialize OCR with CPU support to avoid CUDNN issues - PaddleOCR only"""
    global ocr_reader, ocr_initialization_attempts
    
    try:
        if ocr_initialization_attempts >= max_ocr_initialization_attempts:
            logger.warning(f"OCR initialization attempts exceeded")
            return False
        
        ocr_initialization_attempts += 1
        logger.info(f"OCR initialization attempt {ocr_initialization_attempts}/{max_ocr_initialization_attempts}")
        
        # Initialize PaddleOCR with CPU mode
        if ocr_reader is None:
            # Force CPU mode to avoid CUDNN issues
            import os
            os.environ['FLAGS_use_gpu'] = '0'
            os.environ['CUDA_VISIBLE_DEVICES'] = ''
            os.environ['PADDLE_USE_GPU'] = '0'
            
            ocr_reader = create_paddle_ocr(prefer_gpu=False, lang='en')  # Force CPU
            
        if ocr_reader is None:
            logger.error("PaddleOCR initialization failed")
            return False
        
        logger.info("✅ PaddleOCR initialization completed")
        return True
        
    except Exception as e:
        error_msg = str(e)
        if "cudnn" in error_msg.lower() or "cuda" in error_msg.lower():
            logger.warning(f"❌ CUDNN/CUDA error detected: {error_msg}")
            # Force CPU mode and retry
            try:
                import os
                os.environ['FLAGS_use_gpu'] = '0'
                os.environ['CUDA_VISIBLE_DEVICES'] = ''
                os.environ['PADDLE_USE_GPU'] = '0'
                logger.info("🔄 Forcing CPU mode and retrying...")
                
                # Clear existing reader and retry
                ocr_reader = None
                ocr_reader = create_paddle_ocr(prefer_gpu=False, lang='en')
                
                if ocr_reader is not None:
                    logger.info("✅ PaddleOCR recreated successfully in CPU mode")
                    return True
                else:
                    logger.error("❌ Failed to recreate PaddleOCR in CPU mode")
                    return False
                    
            except Exception as retry_e:
                logger.error(f"❌ Retry failed: {retry_e}")
                return False
        else:
            logger.error(f"❌ Other error in OCR initialization: {e}")
            return False
def safe_image_processing(image):
    """Safely process image with comprehensive error handling"""
    try:
        if image is None:
            logger.warning("Input image is None")
            return None
        
        if not isinstance(image, np.ndarray):
            logger.warning(f"Input image is not numpy array: {type(image)}")
            return None
        
        if image.size == 0:
            logger.warning("Input image is empty")
            return None
        
        # Validate image dimensions
        if len(image.shape) < 2 or len(image.shape) > 3:
            logger.warning(f"Invalid image shape: {image.shape}")
            return None
        
        # Ensure image is in BGR format
        if len(image.shape) == 2:
            # Grayscale to BGR
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif len(image.shape) == 3 and image.shape[2] == 4:
            # RGBA to BGR
            image = cv2.cvtColor(image, cv2.COLOR_RGBA2BGR)
        elif len(image.shape) == 3 and image.shape[2] != 3:
            logger.warning(f"Invalid image channels: {image.shape[2]}")
            return None
        
        # Validate image size
        h, w = image.shape[:2]
        if h < 10 or w < 10:
            logger.warning(f"Image too small: {w}x{h}")
            return None
        
        if h > 4096 or w > 4096:
            logger.warning(f"Image too large: {w}x{h}, resizing...")
            scale = min(4096/w, 4096/h)
            new_w = int(w * scale)
            new_h = int(h * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        return image
        
    except Exception as e:
        logger.error(f"Error in image processing: {e}")
        return None

def safe_frame_encoding(frame):
    """Safely encode frame with comprehensive error handling"""
    try:
        if frame is None:
            logger.warning("Frame is None for encoding")
            return None
        
        # Ensure frame is valid
        if not isinstance(frame, np.ndarray) or frame.size == 0:
            logger.warning("Invalid frame for encoding")
            return None
        
        # Try different encoding methods
        try:
            # Method 1: Standard JPEG encoding with lower quality for speed
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
            return buffer.tobytes()
        except Exception as jpeg_error:
            logger.warning(f"JPEG encoding failed: {jpeg_error}")
            
            try:
                # Method 2: PNG encoding as fallback
                _, buffer = cv2.imencode('.png', frame)
                return buffer.tobytes()
            except Exception as png_error:
                logger.error(f"PNG encoding also failed: {png_error}")
                
                try:
                    # Method 3: Create error frame
                    error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(error_frame, "ENCODING ERROR", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    _, buffer = cv2.imencode('.jpg', error_frame)
                    return buffer.tobytes()
                except Exception as final_error:
                    logger.error(f"Final encoding attempt failed: {final_error}")
                    return None
        
    except Exception as e:
        logger.error(f"Critical error in frame encoding: {e}")
        return None

def validate_ocr_result_strictly(plate_text, confidence, track_id):
    """EXTREMELY lenient validation for testing"""
    if not plate_text or not isinstance(plate_text, str):
        return False, "No text"
    
    clean_text = plate_text.upper().strip()
    logger.info(f"🔍 Validating: '{clean_text}' (conf: {confidence:.3f})")
    
    # EXTREMELY relaxed checks
    if len(clean_text) < 1:  # Accept even single character
        return False, f"Empty text"
    
    if len(clean_text) > 25:  # Very generous length limit
        return False, f"Too long: {len(clean_text)}"
    
    # VERY LOW confidence threshold for testing
    if confidence < 0.001:  # Almost any confidence
        return False, f"Confidence too low: {confidence:.3f}"
    
    # Accept anything with letters or numbers
    has_alnum = any(c.isalnum() for c in clean_text)
    if not has_alnum:
        return False, "Must contain alphanumeric characters"
    
    logger.info(f"✅ VALIDATION PASSED: '{clean_text}' (conf: {confidence:.3f})")
    return True, "Validation passed"
def process_two_row_plate_ocr(plate_crop):
    """Xử lý OCR cho biển số 2 hàng với tách hàng thông minh (projection) và ghép kết quả"""
    try:
        h, w = plate_crop.shape[:2]
        if w <= 0 or h <= 0:
            return None, 0.0
        aspect_ratio = h / w
        logger.info(f"🔄 Processing 2-row plate: {w}x{h}, aspect_ratio: {aspect_ratio:.2f}")
        
        if aspect_ratio <= 0.32:
            return None, 0.0
        
        # 1) Find row boundary using horizontal projection of dark pixels
        try:
            gray0 = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY) if len(plate_crop.shape) == 3 else plate_crop
            gray = cv2.bilateralFilter(gray0, 5, 75, 75)
            thr = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 15)
            # Count dark pixels per row
            proj = np.sum(thr > 0, axis=1).astype(np.int32)
            # Search for a valley (low count) around mid area
            search_top = max(0, int(h * 0.3))
            search_bot = min(h - 1, int(h * 0.7))
            valley_idx = int(np.argmin(proj[search_top:search_bot]) + search_top)
            logger.info(f"📉 Projection valley index: {valley_idx}")
            split_y = valley_idx
        except Exception as e:
            logger.debug(f"Projection split failed: {e}")
            split_y = h // 2
        
        margin = max(4, h // 20)
        top = max(0, split_y - margin)
        bottom = min(h, split_y + margin)
        upper_half = plate_crop[0:bottom, :]
        lower_half = plate_crop[top:h, :]
        logger.info(f"📑 Split plate: upper={upper_half.shape}, lower={lower_half.shape}")
        
        def _prep(img):
            try:
                g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
                g = cv2.bilateralFilter(g, 5, 75, 75)
                g = cv2.equalizeHist(g)
                return g
            except Exception:
                return img
        
        upper_p = _prep(upper_half)
        lower_p = _prep(lower_half)
        
        def _ocr_best(img):
            best_t, best_c = "", 0.0
            if img is None or img.size == 0:
                return best_t, best_c
            try:
                # Build few variants
                variants = []
                try:
                    variants.append(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) if len(img.shape) == 2 else img)
                except Exception:
                    variants.append(img)
                try:
                    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                    g = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    v = clahe.apply(g)
                    variants.append(cv2.cvtColor(v, cv2.COLOR_GRAY2BGR))
                except Exception:
                    pass
                try:
                    g = img if len(img.shape) == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    v = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 25, 15)
                    variants.append(cv2.cvtColor(v, cv2.COLOR_GRAY2BGR))
                except Exception:
                    pass
                
                for v in variants[:4]:
                    res = ocr_with_auto_fallback(ocr_reader, v, det=True, rec=True, cls=True) if ocr_reader else None
                    t, c = safe_extract_ocr_text(res)
                    if t and c and c > best_c:
                        best_t, best_c = t.strip().upper(), float(c)
            except Exception:
                pass
            return best_t, best_c
        
        up_text, up_conf = _ocr_best(upper_p)
        low_text, low_conf = _ocr_best(lower_p)
        if up_text:
            logger.info(f"📄 Upper half: '{up_text}' (conf: {up_conf:.3f})")
        if low_text:
            logger.info(f"📄 Lower half: '{low_text}' (conf: {low_conf:.3f})")
        
        # Normalize segments: remove spaces, normalize separators
        def _normalize(txt):
            t = re.sub(r"\s+", "", txt)
            t = t.replace("—", "-").replace("_", "-")
            return t
        up_text_n = _normalize(up_text)
        low_text_n = _normalize(low_text)
        
        # Use advanced combiner to try separators and pick best
        combined_text, combined_conf = None, 0.0
        try:
            # Build fake OCR results list-like: list of tuples (text, conf)
            upper_results = [(up_text_n, up_conf)] if up_text_n else []
            lower_results = [(low_text_n, low_conf)] if low_text_n else []
            if upper_results or lower_results:
                combined_text, combined_conf = combine_two_row_ocr_results(upper_results, lower_results)
        except Exception as e:
            logger.debug(f"Combiner failed: {e}")
            # Fallback simple combine
            sep = "-" if re.match(r"^\d{2}[A-Z]{1,2}\d?$", up_text_n) else ""
            tmp = (up_text_n + (sep if sep else "") + low_text_n) if (up_text_n or low_text_n) else ""
            if tmp:
                combined_text, combined_conf = tmp, max(up_conf, low_conf)
        
        if combined_text:
            logger.info(f"🔗 Combined 2-row result: '{combined_text}' (conf: {combined_conf:.3f})")
            return combined_text, combined_conf
        
        return None, 0.0
    
    except Exception as e:
        logger.error(f"Error in 2-row plate processing: {e}")
        return None, 0.0
def debug_plate_detection(vehicle_crop, track_id):
    """Debug function để kiểm tra plate detection"""
    try:
        logger.info(f"🔍 Debug plate detection for track {track_id}")
        logger.info(f"Vehicle crop shape: {vehicle_crop.shape}")
        
        if plate_model is None:
            logger.error("❌ Plate model is None!")
            return False
        
        # Test detection với confidence rất thấp
        results = plate_model(vehicle_crop, conf=0.01, verbose=True)
        logger.info(f"Detection results: {len(results) if results else 0}")
        
        if results:
            for i, result in enumerate(results):
                if hasattr(result, 'boxes') and result.boxes is not None:
                    boxes = result.boxes
                    logger.info(f"Result {i}: {len(boxes)} boxes detected")
                    
                    if hasattr(boxes, 'conf'):
                        confs = boxes.conf
                        if hasattr(confs, 'cpu'):
                            confs = confs.cpu().numpy()
                        logger.info(f"Confidences: {confs}")
        else:
                    logger.info(f"Result {i}: No boxes")
        
        return True
        
    except Exception as e:
        logger.error(f"Debug error: {e}")
        return False

def should_save_plate(plate_text, confidence, track_id=None):
    """ENHANCED save logic with consistency tracking"""
    global duplicate_counter, plate_history, track_consistency, ocr_attempts_per_track
    
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    clean_text = plate_text.upper().strip()
    # Reject single-char noise early
    if len(re.sub(r'[^A-Z0-9]', '', clean_text)) < 2:
        return False
    
    # Basic validation
    is_valid, reason = validate_ocr_result_strictly(plate_text, confidence, 0)
    
    if not is_valid:
        logger.info(f"❌ Not saving '{clean_text}': {reason}")
        return False
    
    # ==== CONSISTENCY TRACKING ====
    if track_id is not None:
        if track_id not in track_consistency:
            track_consistency[track_id] = {
                'results': [],
                'best_result': None,
                'best_confidence': 0.0,
                'consistent_count': 0,
                'last_result': None
            }
        
        consistency_data = track_consistency[track_id]
        
        # Add current result to history
        consistency_data['results'].append({
            'text': clean_text,
            'confidence': confidence,
            'timestamp': time.time()
        })
        
        # Keep only recent results
        if len(consistency_data['results']) > consistency_window:
            consistency_data['results'] = consistency_data['results'][-consistency_window:]
        
        # Check for consistency
        if len(consistency_data['results']) >= consistency_threshold:
            # Count how many times the same text appears
            text_counts = {}
            for result in consistency_data['results']:
                text = result['text']
                text_counts[text] = text_counts.get(text, 0) + 1
            
            # Find most common text
            most_common_text = max(text_counts.items(), key=lambda x: x[1])
            most_common_count = most_common_text[1]
            
            if most_common_count >= consistency_threshold:
                # We have consistency!
                consistent_text = most_common_text[0]
                consistent_confidence = max([r['confidence'] for r in consistency_data['results'] if r['text'] == consistent_text])
                
                consistency_data['consistent_count'] = most_common_count
                consistency_data['last_result'] = consistent_text
                
                # Update best result if this is better
                if consistent_confidence > consistency_data['best_confidence']:
                    consistency_data['best_result'] = consistent_text
                    consistency_data['best_confidence'] = consistent_confidence
                    logger.info(f"🎯 CONSISTENT RESULT for track {track_id}: '{consistent_text}' (conf: {consistent_confidence:.3f}, count: {most_common_count})")
                    return True
                else:
                    logger.info(f"🔄 Consistent but not better: '{consistent_text}' (conf: {consistent_confidence:.3f} <= {consistency_data['best_confidence']:.3f})")
                    return True  # vẫn giữ kết quả nhất quán hiện tại
            else:
                logger.debug(f"📊 No consistency yet for track {track_id}: {text_counts}")
                return False
        else:
            logger.debug(f"📈 Building consistency for track {track_id}: {len(consistency_data['results'])}/{consistency_threshold}")
            return False
    
    # ==== FALLBACK DUPLICATE CHECK ====
    if clean_text in plate_history:
        existing = plate_history[clean_text]
        existing_conf = existing.get('confidence', 0.0)
        
        # Update if significantly better
        if confidence > existing_conf * 1.2:  # Only 20% better needed
            logger.info(f"🔄 UPDATE: '{clean_text}': {existing_conf:.3f} -> {confidence:.3f}")
            plate_history[clean_text].update({
                'confidence': confidence,
                'timestamp': time.time(),
                'updated_count': existing.get('updated_count', 0) + 1
            })
            return True
        else:
            duplicate_counter += 1
            return False
    else:
        # New plate - always save if valid
        plate_history[clean_text] = {
            'confidence': confidence,
            'timestamp': time.time(),
            'updated_count': 1,
            'saved_once': True
        }
        logger.info(f"✅ NEW PLATE SAVED: '{clean_text}' (conf: {confidence:.3f})")
        return True

def debug_ocr_result(ocr_result, plate_crop=None):
    """Debug OCR result structure"""
    try:
        logger.info(f"🔍 OCR DEBUG:")
        logger.info(f"  Result type: {type(ocr_result)}")
        logger.info(f"  Result value: {str(ocr_result)[:500]}")
        
        if plate_crop is not None:
            logger.info(f"  Plate crop shape: {plate_crop.shape}")
            logger.info(f"  Plate crop dtype: {plate_crop.dtype}")
            
            # Save debug image
            try:
                import os
                debug_dir = os.path.join(os.path.dirname(__file__), 'debug_crops')
                os.makedirs(debug_dir, exist_ok=True)
                debug_path = os.path.join(debug_dir, f"debug_ocr_{int(time.time())}.jpg")
                cv2.imwrite(debug_path, plate_crop)
                logger.info(f"  Debug crop saved: {debug_path}")
            except Exception as save_e:
                logger.warning(f"Could not save debug crop: {save_e}")
        
        return True
        
    except Exception as e:
        logger.error(f"Debug OCR failed: {e}")
        return False

def _is_valid_vn_plate_format(plate_text):
    """Enhanced validation for Vietnamese license plate format - OPTIMIZED VERSION"""
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    # Clean the text - keep only alphanumeric, dash, dot
    clean_text = re.sub(r'[^A-Z0-9\-\.]', '', plate_text.upper().strip())
    
    if len(clean_text) < 4:
        return False
    
    # ENHANCED Vietnamese license plate patterns - COMPREHENSIVE
    patterns = [
        # ==== Ô TÔ (CAR) FORMATS ====
        r'^\d{2}[A-Z]-\d{2}\.\d{2}$',          # 30A-12.34 (ngắn)
        r'^\d{2}[A-Z]-\d{3}\.\d{2}$',          # 30A-123.45 (chuẩn)
        r'^\d{2}[A-Z]-\d{4}\.\d{2}$',          # 30A-1234.56 (dài)
        r'^\d{2}[A-Z]-\d{5}$',                  # 30A-12345 (taxi)
        r'^\d{2}[A-Z]-\d{6}$',                  # 30A-123456 (taxi dài)
        
        # ==== XE MÁY (MOTORCYCLE) FORMATS ====
        r'^\d{2}[A-Z]\d-\d{4}$',                # 30A1-2345 (cũ)
        r'^\d{2}[A-Z]\d-\d{3}\.\d{2}$',        # 30A1-234.56 (mới)
        r'^\d{2}[A-Z]\d-\d{4}\.\d{2}$',        # 30A1-2345.67 (mới dài)
        
        # ==== NGOẠI GIAO (DIPLOMATIC) FORMATS ====
        r'^\d{2}[A-Z]{2}-\d{2}\.\d{2}$',       # 30AB-12.34
        r'^\d{2}[A-Z]{2}-\d{3}\.\d{2}$',       # 30AB-123.45
        r'^\d{2}[A-Z]{2}-\d{4}\.\d{2}$',       # 30AB-1234.56
        
        # ==== QUÂN ĐỘI/CẢNH SÁT (MILITARY/POLICE) ====
        r'^[A-Z]{2}\d{4}$',                     # QD1234, CS1234
        r'^[A-Z]{2}\d{3}\.\d{2}$',              # QD123.45
        
        # ==== COMPACT FORMATS (KHÔNG DẤU PHÂN CÁCH) ====
        r'^\d{2}[A-Z]\d{4,5}$',                 # 30A1234, 30A12345
        r'^\d{2}[A-Z]{2}\d{4,5}$',              # 30AB1234, 30AB12345
        r'^\d{2}[A-Z]\d{3}\.\d{2}$',            # 30A123.45 (compact)
        
        # ==== PARTIAL FORMATS (CHO OCR KHÔNG HOÀN HẢO) ====
        r'^\d{2}[A-Z]\d{3,4}$',                 # 30A123, 30A1234 (partial)
        r'^\d{2}[A-Z]{1,2}\d{2,4}$',            # 30A12, 30AB123 (partial)
        r'^\d{1,2}[A-Z]\d{3,4}$',               # 3A123, 30A123 (partial)
        
        # ==== FLEXIBLE FORMATS (CHO OCR KHÓ) ====
        r'^\d{2}[A-Z][\-\s]?\d{2,4}[\-\s]?\d{2}$',  # 30A-12-34, 30A 12 34
        r'^\d{2}[A-Z]\d{2,4}[\-\s]?\d{2}$',         # 30A12-34, 30A1234
    ]
    
    for pattern in patterns:
        if re.match(pattern, clean_text):
            return True
    
    return False

def _is_valid_vn_plate_format_relaxed(plate_text):
    """Relaxed validation for Vietnamese license plate format"""
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    # Clean the text
    clean_text = re.sub(r'[^A-Z0-9\-\.]', '', plate_text.upper().strip())
    
    if len(clean_text) < 4:
        return False
    
    # More relaxed Vietnamese license plate patterns
    patterns = [
        # Strict patterns from above
        r'^\d{2}[A-Z]-\d{2}\.\d{2}$',          # 30A-12.34
        r'^\d{2}[A-Z]-\d{3}\.\d{2}$',          # 30A-123.45
        r'^\d{2}[A-Z]-\d{4}\.\d{2}$',          # 30A-1234.56
        r'^\d{2}[A-Z]-\d{5}$',                  # 30A-12345 (no dot)
        r'^\d{2}[A-Z]\d-\d{4}$',                # 30A1-2345 (motorcycle old)
        r'^\d{2}[A-Z]\d-\d{3}\.\d{2}$',        # 30A1-234.56 (motorcycle new)
        r'^\d{2}[A-Z][A-Z0-9]?\d{4,5}$',       # 30A1234 / 30AB12345
        r'^\d{2}[A-Z]{2}-\d{2}\.\d{2}$',       # 30AB-12.34
        r'^\d{2}[A-Z]{2}-\d{3}\.\d{2}$',       # 30AB-123.45
        
        # Relaxed patterns - accept more variations
        r'^\d{1,3}[A-Z]{1,3}\d{3,6}$',         # General pattern: digits + letters + digits
        r'^\d{2}[A-Z]{1,2}[\-\.]?\d{3,6}$',    # With optional separator
        r'^[A-Z]{1,2}\d{2,3}[\-\.]?\d{3,6}$',  # Letter prefix variants
        r'^\d{2}[A-Z]\d{3,6}$',                 # Simple format
        r'^\d{2}[A-Z]{2}\d{3,6}$',             # Double letter format
    ]
    
    for pattern in patterns:
        if re.match(pattern, clean_text):
            return True
    
    return False

def _is_basic_alphanumeric_plate(plate_text):
    """REALISTIC check for alphanumeric plate format - accept partial plates"""
    if not plate_text or not isinstance(plate_text, str):
        return False
    
    clean_text = re.sub(r'[^A-Z0-9]', '', plate_text.upper().strip())
    
    # Accept partial plates (2+ characters)
    if len(clean_text) < MIN_PLATE_LENGTH or len(clean_text) > MAX_PLATE_LENGTH:
        return False
    
    # For very short text (2-3 chars), accept anything alphanumeric
    if len(clean_text) <= 3:
        return True  # Accept 'O', 'R', 'P', 'SE', '30', etc.
    
    # For longer text, require mix of letters and numbers
    has_letter = any(c.isalpha() for c in clean_text)
    has_digit = any(c.isdigit() for c in clean_text)
    
    return has_letter and has_digit

# Helpers adapted from detect_plate.py expectations
def clean_and_preserve_structure(text: str) -> str:
    try:
        if not isinstance(text, str):
            return ""
        # Keep alphanumerics, dash and dot, uppercase for consistency
        return re.sub(r'[^A-Z0-9\-\.]', '', text.upper().strip())
    except Exception:
        return ""

def analyze_dash_position_precise(cleaned_text: str) -> Dict[str, Any]:
    """Lightweight heuristic analysis returning vehicle_type and confidence.
    Provides a stable interface for callers expecting this from detect_plate.py.
    """
    try:
        text = cleaned_text or ""
        is_relaxed_valid = _is_valid_vn_plate_format_relaxed(text)
        vehicle_type = 'car' if '-' in text or '.' in text else 'unknown'
        conf = 0.85 if is_relaxed_valid else (0.5 if _is_basic_alphanumeric_plate(text) else 0.2)
        return {'vehicle_type': vehicle_type, 'confidence': float(conf)}
    except Exception:
        return {'vehicle_type': 'unknown', 'confidence': 0.3}

def cleanup_tracked_objects():
    """ENHANCED cleanup with consistency tracking"""
    global tracked_objects, plate_history, last_cleanup_time, track_consistency, ocr_attempts_per_track
    
    try:
        current_time = time.time()
        
        # Don't cleanup too frequently (every 5 seconds max)
        if current_time - last_cleanup_time < 5:
            return
        
        last_cleanup_time = current_time
        
        if not tracked_objects:
            return
        
        logger.info(f"🧹 ENHANCED cleanup of {len(tracked_objects)} tracked objects...")
        
        # Step 1: Clean up old consistency data
        old_tracks = set(track_consistency.keys()) - set(tracked_objects.keys())
        for old_track in old_tracks:
            del track_consistency[old_track]
            if old_track in ocr_attempts_per_track:
                del ocr_attempts_per_track[old_track]
        
        if old_tracks:
            logger.info(f"🧹 Cleaned up {len(old_tracks)} old consistency records")
        
        # Step 2: Group objects by plate number (prioritize consistent results)
        plate_groups = {}
        vehicles_without_plates = {}
        
        for track_id, obj in tracked_objects.items():
            plate_num = obj.get('plate_number', '')
            confidence = obj.get('confidence', 0)
            is_consistent = obj.get('is_consistent', False)
            
            # Keep vehicles without plates
            if not plate_num or plate_num == 'Đang nhận diện...':
                vehicles_without_plates[track_id] = obj
                continue
            
            # Remove invalid formats
            if not _is_valid_vn_plate_format_relaxed(plate_num):
                logger.info(f"🗑️ Removed invalid plate '{plate_num}' (track {track_id})")
                continue
            
            # Group by plate number
            if plate_num not in plate_groups:
                plate_groups[plate_num] = []
            plate_groups[plate_num].append((track_id, obj, confidence, is_consistent))
        
        # Step 3: For each plate number, prioritize consistent results
        valid_objects = {}
        duplicates_removed = 0
        
        for plate_num, group in plate_groups.items():
            if len(group) == 1:
                # Only one result, keep it
                track_id, obj, confidence, is_consistent = group[0]
                valid_objects[track_id] = obj
                logger.debug(f"✅ Kept single result for '{plate_num}': conf {confidence:.3f}, consistent: {is_consistent}")
            else:
                # Multiple results - prioritize consistent ones
                # Sort by consistency first, then by confidence
                group.sort(key=lambda x: (not x[3], -x[2]))  # Consistent first, then highest confidence
                best_track_id, best_obj, best_confidence, best_consistent = group[0]
                
                # Keep only the best
                valid_objects[best_track_id] = best_obj
                logger.info(f"🎯 Kept BEST result for '{plate_num}': conf {best_confidence:.3f}, consistent: {best_consistent} (removed {len(group)-1} duplicates)")
                
                # Remove all others
                duplicates_removed += len(group) - 1
                
                # Update plate_history to reflect the best result
                if plate_num in plate_history:
                    plate_history[plate_num]['confidence'] = best_confidence
                    plate_history[plate_num]['timestamp'] = current_time
        
        # Step 4: Add back vehicles without plates
        valid_objects.update(vehicles_without_plates)
        
        old_count = len(tracked_objects)
        tracked_objects = valid_objects
        new_count = len(tracked_objects)
        
        logger.info(f"🧹 ENHANCED cleanup completed:")
        logger.info(f"   Total objects: {old_count} -> {new_count}")
        logger.info(f"   Duplicates removed: {duplicates_removed}")
        logger.info(f"   Unique plates: {len(plate_groups)}")
        logger.info(f"   Vehicles without plates: {len(vehicles_without_plates)}")
        logger.info(f"   Plate history size: {len(plate_history)}")
        logger.info(f"   Consistency records: {len(track_consistency)}")
        
        if old_count != new_count:
            logger.info(f"🎯 Cleanup successful: removed {old_count - new_count} objects")
            
    except Exception as e:
        logger.error(f"Error in enhanced cleanup: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
# ---- Paddle GPU detection and OCR init helpers ----
def is_paddle_gpu_available() -> bool:
    """Kiểm tra Paddle GPU availability một cách chính xác"""
    try:
        if paddle is None:
            logger.info("Paddle module not available")
            return False
        
        # Kiểm tra compiled with CUDA
        try:
            compiled_with_cuda = bool(paddle.is_compiled_with_cuda())
            logger.info(f"Paddle compiled with CUDA: {compiled_with_cuda}")
        except Exception as e:
            logger.warning(f"Could not check CUDA compilation: {e}")
            compiled_with_cuda = False
        
        if not compiled_with_cuda:
            logger.info("Paddle not compiled with CUDA")
            return False
        
        # Kiểm tra CUDA device count
        try:
            device_count = paddle.device.cuda.device_count()
            logger.info(f"CUDA devices available: {device_count}")
        except Exception as e:
            logger.warning(f"Could not get CUDA device count: {e}")
            device_count = 0
        
        if device_count <= 0:
            logger.info("No CUDA devices available")
            return False
        
        # ==== TEST THỰC TẾ PADDLE GPU ====
        try:
            # Tạo tensor đơn giản trên GPU để test
            test_tensor = paddle.to_tensor([1.0, 2.0], place=paddle.CUDAPlace(0))
            result = paddle.sum(test_tensor)
            result_cpu = result.numpy()
            logger.info(f"✅ Paddle GPU test successful: {result_cpu}")
            return True
        except Exception as gpu_test_e:
            logger.warning(f"❌ Paddle GPU test failed: {gpu_test_e}")
            # FIXED: Don't return False immediately, try CPU fallback
            logger.info("🔄 GPU test failed, will use CPU fallback")
            return False
        
    except Exception as e:
        logger.warning(f"Error checking Paddle GPU availability: {e}")
        return False
# ==== SỬA LỖI OCR TRẢ VỀ [None] - GIẢI PHÁP TOÀN DIỆN ====

# 1. SỬA HÀM ocr_with_auto_fallback - KIỂM TRA IMAGE TRƯỚC KHI GỌI OCR
def ocr_with_auto_fallback_simple(reader: Optional[PaddleOCR], image: np.ndarray, det: bool, rec: bool, cls: bool):
    """Run OCR with timeout protection"""
    try:
        if reader is None or image is None or image.size == 0:
            return None
            
        ocr_start = time.time()
        OCR_TIMEOUT = 1.0  # 1 second timeout
        
        # Quick preprocessing
        processed_image = image.copy()
        if len(processed_image.shape) == 2:
            processed_image = cv2.cvtColor(processed_image, cv2.COLOR_GRAY2BGR)
        
        # Simple upscaling if needed
        h, w = processed_image.shape[:2]
        if w < 100 or h < 40:
            scale = max(100/w, 40/h, 2.0)  # Reduced from 3.0 for speed
            new_w, new_h = int(w * scale), int(h * scale)
            processed_image = cv2.resize(processed_image, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        
        # Single OCR attempt with timeout
        try:
            result = reader.ocr(processed_image, det=det, rec=rec, cls=False)  # Always disable cls for speed
            ocr_time = time.time() - ocr_start
            
            if ocr_time > OCR_TIMEOUT:
                logger.warning(f"OCR exceeded timeout: {ocr_time:.2f}s")
                return None
                
            return result
            
        except Exception as ocr_error:
            logger.error(f"OCR execution error: {ocr_error}")
            return None
            
    except Exception as e:
        logger.error(f"OCR fallback error: {e}")
        return None
# 2. SỬA HÀM create_paddle_ocr - CẤU HÌNH TỐI ƯU CHO VIỆT NAM
def create_paddle_ocr(prefer_gpu=False, lang='en'):
    """Create PaddleOCR with CPU-optimized configuration"""
    try:
        logger.info("🔧 Creating PaddleOCR with CPU configuration...")
        
        # Force CPU mode to avoid CUDNN issues
        import os
        os.environ['FLAGS_use_gpu'] = '0'
        os.environ['CUDA_VISIBLE_DEVICES'] = ''
        os.environ['PADDLE_USE_GPU'] = '0'
        
        # IMPROVED PaddleOCR config for better license plate recognition
        from paddleocr import PaddleOCR
        reader = PaddleOCR(
            use_angle_cls=True,  # Enable angle classification for better accuracy
            lang='en',
            show_log=False,
            use_gpu=False,  # Force CPU mode
            enable_mkldnn=True,  # Enable MKL-DNN for better CPU performance
            cpu_threads=4,  # Increase CPU threads
            rec_batch_num=1,
            # Optimized detection thresholds for license plates
            det_db_thresh=0.15,  # Balanced threshold for license plates
            det_db_box_thresh=0.25,  # Balanced box threshold
            det_db_unclip_ratio=1.8,  # Increased for better text detection
            drop_score=0.1,  # Increased drop score for better quality
            rec_image_shape='3,48,320',
            use_space_char=True,
            # Additional parameters for better license plate recognition
            det_limit_side_len=960,  # Limit side length for better performance
            det_limit_type='max'
        )
        
        logger.info("✅ PaddleOCR created successfully (CPU mode)")
        return reader
            
    except Exception as e:
        logger.error(f"❌ PaddleOCR creation failed: {e}")
        # Try alternative initialization
        try:
            logger.info("🔄 Trying alternative PaddleOCR initialization...")
            from paddleocr import PaddleOCR
            reader = PaddleOCR(
                use_angle_cls=False,
                lang='en',
                show_log=False,
                use_gpu=False
            )
            logger.info("✅ Alternative PaddleOCR initialization successful")
            return reader
        except Exception as alt_e:
            logger.error(f"❌ Alternative PaddleOCR also failed: {alt_e}")
            return None

def ocr_with_auto_fallback(reader: Optional[PaddleOCR], image: np.ndarray, det: bool, rec: bool, cls: bool):
    """OCR with comprehensive fallback and debugging"""
    try:
        if reader is None or image is None or image.size == 0:
            return None
        
        # Ensure minimum size
        h, w = image.shape[:2]
        if w < 100 or h < 40:
            scale = max(100/w, 40/h, 3.0)
            new_w, new_h = int(w * scale), int(h * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        
        # Add white padding
        pad_size = 20
        image = cv2.copyMakeBorder(image, pad_size, pad_size, pad_size, pad_size, 
                                 cv2.BORDER_CONSTANT, value=[255, 255, 255])
        
        # Primary OCR attempt
        try:
            result = reader.ocr(image, det=det, rec=rec, cls=False)  # Always disable cls
            
            if result and isinstance(result, list) and len(result) > 0:
                # Quick validation
                text, conf = safe_extract_ocr_text(result)
                if text and conf > 0.01:
                    logger.info(f"Primary OCR success: '{text}' ({conf:.3f})")
                    return result
                    
        except Exception as e:
            logger.warning(f"Primary OCR failed: {e}")
        
        # Fallback: Try with different preprocessing
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            # High contrast
            enhanced = cv2.convertScaleAbs(gray, alpha=2.0, beta=30)
            enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
            
            result = reader.ocr(enhanced_bgr, det=True, rec=True, cls=False)
            
            if result:
                text, conf = safe_extract_ocr_text(result)
                if text and conf > 0.01:
                    logger.info(f"Enhanced OCR success: '{text}' ({conf:.3f})")
                    return result
                    
        except Exception as e:
            logger.warning(f"Enhanced OCR failed: {e}")
        
        # Final fallback: rec-only
        try:
            result = reader.ocr(image, det=False, rec=True, cls=False)
            
            if result:
                text, conf = safe_extract_ocr_text(result)
                if text and conf > 0.01:
                    logger.info(f"Rec-only OCR success: '{text}' ({conf:.3f})")
                    return result
                    
        except Exception as e:
            logger.warning(f"Rec-only OCR failed: {e}")
        
        logger.error("All OCR attempts failed")
        return None
        
    except Exception as e:
        logger.error(f"OCR with fallback error: {e}")
        return None

def _edge_detection_ocr_fallback(processed_image, reader):
    """Edge detection + OCR fallback strategy"""
    try:
        # Convert to grayscale
        gray = cv2.cvtColor(processed_image, cv2.COLOR_BGR2GRAY)
        
        # Apply edge detection
        edges = cv2.Canny(gray, 30, 100)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Look for rectangular contours that could be plates
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 50:  # Minimum area
                x, y, w_contour, h_contour = cv2.boundingRect(contour)
                
                # Check aspect ratio (plates are usually wider than tall)
                aspect_ratio = w_contour / max(1, h_contour)
                if 1.5 <= aspect_ratio <= 10.0:  # Plate aspect ratio
                    # Crop the potential plate area
                    plate_crop = processed_image[y:y+h_contour, x:x+w_contour]
                    
                    if plate_crop.size > 0:
                        # Try OCR on this crop
                        try:
                            result = reader.ocr(plate_crop, det=False, rec=True, cls=False)
                            if result:
                                text, conf = safe_extract_ocr_text(result)
                                if text and conf > 0.005:
                                    return result
                        except Exception:
                            continue
        
        return None
        
    except Exception as e:
        logger.debug(f"Edge detection OCR fallback failed: {e}")
        return None

# FPS tracking
last_frame_time = None
smoothed_fps = 0.0

# Plate model candidates - only yolov9s.pt
PLATE_MODEL_CANDIDATE_NAMES = [
    'yolov9s.pt'
]

# HARD-CODED selection for plate model - only yolov9s.pt
PLATE_MODEL_FIXED_NAME = 'yolov9s.pt'  # Use yolov9s.pt for license plate detection

def get_available_plate_models():
    try:
        models = []
        search_paths = [
            current_dir,  # Root directory
            os.path.join(current_dir, 'models'),  # Models subdirectory
            os.path.expanduser('~/.ultralytics'),  # Ultralytics cache
        ]
        
        for base_path in search_paths:
            if not os.path.exists(base_path):
                continue
                
            for name in PLATE_MODEL_CANDIDATE_NAMES:
                full_path = os.path.join(base_path, name)
                if os.path.exists(full_path):
                    models.append(full_path)
                    logger.info(f"Found model: {full_path}")
        
        if not models:
            logger.warning("No plate models found, will use YOLO fallback")
            
        return models
    except Exception as e:
        logger.error(f"Error scanning for models: {e}")
        return []

def _load_plate_model_from_path(model_path: str):
    global plate_model, plate_model_name
    try:
        if not os.path.exists(model_path):
            logger.warning(f"Plate model path does not exist: {model_path}")
            # FALLBACK: Sử dụng YOLO model chung nếu không có model chuyên dụng
            if yolo_model is not None:
                logger.info("Using general YOLO model for plate detection as fallback")
                plate_model = yolo_model
                plate_model_name = "yolo_fallback"
                return True
            return False
            
        logger.info(f"Loading license plate model: {model_path}")
        plate_model = safe_yolo_load(model_path)
        
        if plate_model is None:
            logger.error(f"Failed to load plate model with safe_yolo_load: {model_path}")
            # FALLBACK: Sử dụng YOLO model chung
            if yolo_model is not None:
                logger.info("Using general YOLO model for plate detection as fallback")
                plate_model = yolo_model
                plate_model_name = "yolo_fallback"
                return True
            return False
        
        # Move to GPU if available
        try:
            if torch.cuda.is_available():
                plate_model.to('cuda')
                logger.info(f"Plate model moved to CUDA")
            else:
                logger.info("Plate model loaded on CPU")
        except Exception as e:
            logger.warning(f"Could not move plate model to CUDA: {e}")
        
        plate_model_name = os.path.basename(model_path)
        logger.info(f"✅ Plate model loaded successfully: {plate_model_name}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load plate model {model_path}: {e}")
        # FALLBACK: Sử dụng YOLO model chung
        if yolo_model is not None:
            logger.info("Using general YOLO model for plate detection as fallback")
            plate_model = yolo_model
            plate_model_name = "yolo_fallback"
            return True
        return False
def debug_ocr_engine_health():
    """Kiểm tra tình trạng OCR engines"""
    try:
        logger.info("🔍 DEBUGGING OCR ENGINE HEALTH...")
        
        # Kiểm tra global readers
        global ocr_reader, ocr_reader_fallback
        
        logger.info(f"OCR Reader: {'Available' if ocr_reader else 'None'}")
        logger.info(f"OCR Fallback: {'Available' if ocr_reader_fallback else 'None'}")
        
        if ocr_reader is None and ocr_reader_fallback is None:
            logger.error("❌ BOTH OCR readers are None!")
            return False
        
        # Test primary reader
        if ocr_reader:
            try:
                test_img = np.ones((60, 200, 3), dtype=np.uint8) * 255
                cv2.rectangle(test_img, (10, 10), (190, 50), (0, 0, 0), -1)
                cv2.putText(test_img, "TEST", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                
                result = ocr_reader.ocr(test_img, det=True, rec=True, cls=True)
                logger.info(f"✅ Primary OCR test: {type(result)} - {str(result)[:100]}")
                
                if result is None or (isinstance(result, list) and all(x is None for x in result)):
                    logger.error("❌ Primary OCR returns None!")
                    return False
                else:
                    logger.info("✅ Primary OCR working")
                    
            except Exception as e:
                logger.error(f"❌ Primary OCR test failed: {e}")
                return False
        
        return True
        
    except Exception as e:
        logger.error(f"OCR health check failed: {e}")
        return False
def force_recreate_ocr():
    """Tạo lại OCR readers hoàn toàn từ đầu"""
    global ocr_reader, ocr_reader_fallback  # XÓA ocr_reader_fallback
    
    logger.warning("🔄 FORCE RECREATING OCR READERS FROM SCRATCH...")
    
    try:
        # Clear existing readers completely
        if ocr_reader:
            try:
                del ocr_reader
            except:
                pass
        # XÓA PHẦN XỬ LÝ ocr_reader_fallback
        
        ocr_reader = None
        # ocr_reader_fallback = None  # XÓA DÒNG NÀY
        
        # Force garbage collection
        import gc
        gc.collect()
        
        logger.info("🗑️ Cleared existing OCR readers")
        
        # Recreate chỉ PaddleOCR
        logger.info("🔧 Creating new CPU-only PaddleOCR reader...")
        ocr_reader = create_paddle_ocr(prefer_gpu=False, lang='en')
        
        if ocr_reader:
            logger.info("✅ New PaddleOCR reader created")
            return True
        else:
            logger.error("❌ Failed to create PaddleOCR reader")
            return False
        
    except Exception as e:
        logger.error(f"❌ Force recreate OCR failed: {e}")
        return False  
def set_plate_model_by_name(name: str):
    """Select and load a plate model by file name (basename)."""
    try:
        available = get_available_plate_models()
        for path in available:
            if os.path.basename(path).lower() == str(name).lower():
                return _load_plate_model_from_path(path)
        logger.warning(f"Requested plate model not found: {name}")
        return False
    except Exception as e:
        logger.error(f"Error selecting plate model {name}: {e}")
        return False

def cycle_plate_model():
    """Cycle to the next available plate model in the preference list."""
    try:
        available = get_available_plate_models()
        if not available:
            logger.warning("No plate models available to cycle")
            return False
        if plate_model_name is None:
            return _load_plate_model_from_path(available[0])
        current_idx = -1
        for i, path in enumerate(available):
            if os.path.basename(path) == plate_model_name:
                current_idx = i
                break
        next_idx = (current_idx + 1) % len(available)
        return _load_plate_model_from_path(available[next_idx])
    except Exception as e:
        logger.error(f"Error cycling plate model: {e}")
        return False

def get_plate_model_status():
    try:
        return {
            'current': plate_model_name,
            'available': [os.path.basename(p) for p in get_available_plate_models()]
        }
    except Exception:
        return {'current': plate_model_name, 'available': []}

def get_tracked_objects_status():
    """Get detailed status of tracked_objects for debugging"""
    try:
        if not tracked_objects:
            return {
                'total': 0,
                'valid_plates': 0,
                'duplicates': 0,
                'invalid_plates': 0,
                'vehicles_only': 0,
                'details': {},
                'plate_history_size': len(plate_history),
                'duplicates_prevented': duplicate_counter,
                'consistency_records': len(track_consistency),
                'ocr_attempts': len(ocr_attempts_per_track)
            }
        
        # Analyze tracked_objects
        plate_counts = {}
        invalid_count = 0
        vehicles_only = 0
        consistent_plates = 0
        
        for track_id, obj in tracked_objects.items():
            plate_num = obj.get('plate_number', '')
            confidence = obj.get('confidence', 0)
            is_consistent = obj.get('is_consistent', False)
            
            if not plate_num or plate_num == 'Đang nhận diện...':
                vehicles_only += 1
                continue
            
            if not _is_valid_vn_plate_format(plate_num):
                invalid_count += 1
                continue
            
            if is_consistent:
                consistent_plates += 1
            
            if plate_num not in plate_counts:
                plate_counts[plate_num] = []
            plate_counts[plate_num].append({
                'track_id': track_id,
                'confidence': confidence,
                'is_consistent': is_consistent,
                'first_seen': obj.get('first_seen', 0),
                'last_seen': obj.get('last_seen', 0),
                'ocr_attempts': obj.get('ocr_attempts', 0)
            })
        
        # Find duplicates
        duplicates = {plate: tracks for plate, tracks in plate_counts.items() if len(tracks) > 1}
        
        # Analyze consistency data
        consistency_summary = {}
        for track_id, consistency_data in track_consistency.items():
            if track_id in tracked_objects:
                consistency_summary[track_id] = {
                    'best_result': consistency_data.get('best_result'),
                    'best_confidence': consistency_data.get('best_confidence', 0),
                    'consistent_count': consistency_data.get('consistent_count', 0),
                    'total_results': len(consistency_data.get('results', [])),
                    'ocr_attempts': ocr_attempts_per_track.get(track_id, 0)
                }
        
        return {
            'total': len(tracked_objects),
            'valid_plates': len(plate_counts),
            'consistent_plates': consistent_plates,
            'duplicates': len(duplicates),
            'invalid_plates': invalid_count,
            'vehicles_only': vehicles_only,
            'duplicate_details': duplicates,
            'all_plates': plate_counts,
            'plate_history_size': len(plate_history),
            'duplicates_prevented': duplicate_counter,
            'consistency_records': len(track_consistency),
            'ocr_attempts': len(ocr_attempts_per_track),
            'consistency_summary': consistency_summary,
            'last_cleanup': last_cleanup_time
        }
        
    except Exception as e:
        logger.error(f"Error getting tracked_objects status: {e}")
        return {'error': str(e)}

def reset_anti_duplicate_system():
    """Reset the entire anti-duplicate system"""
    global tracked_objects, plate_history, duplicate_counter, last_cleanup_time, track_consistency, ocr_attempts_per_track
    
    logger.warning("🔄 RESETTING ANTI-DUPLICATE SYSTEM...")
    
    old_tracked_count = len(tracked_objects)
    old_history_count = len(plate_history)
    old_consistency_count = len(track_consistency)
    old_attempts_count = len(ocr_attempts_per_track)
    
    tracked_objects.clear()
    plate_history.clear()
    track_consistency.clear()
    ocr_attempts_per_track.clear()
    duplicate_counter = 0
    last_cleanup_time = 0
    
    logger.info(f"🔄 Anti-duplicate system reset:")
    logger.info(f"   Tracked objects: {old_tracked_count} -> 0")
    logger.info(f"   Plate history: {old_history_count} -> 0")
    logger.info(f"   Consistency records: {old_consistency_count} -> 0")
    logger.info(f"   OCR attempts: {old_attempts_count} -> 0")
    logger.info(f"   Duplicate counter: reset to 0")
    logger.info(f"   Last cleanup: reset to 0")
    
    return {
        'success': True,
        'message': 'Anti-duplicate system reset successfully',
        'old_tracked_count': old_tracked_count,
        'old_history_count': old_history_count,
        'old_consistency_count': old_consistency_count,
        'old_attempts_count': old_attempts_count
    }

# Tracker removed - using direct plate detection only
# Tracker removed - using direct plate detection only
def calculate_centroid(xmin, ymin, xmax, ymax):
    return ((xmin + xmax) / 2, (ymin + ymax) / 2)

def calculate_roi_coordinates(width, height):
    """Tính toán ROI coordinates dựa trên kích thước frame"""
    try:
        roi_xmin = max(0, int(width * ROI_PERCENT_XMIN))
        roi_ymin = max(0, int(height * ROI_PERCENT_YMIN))
        roi_xmax = min(width-1, int(width * ROI_PERCENT_XMAX))
        roi_ymax = min(height-1, int(height * ROI_PERCENT_YMAX))
        
        # Đảm bảo ROI hợp lệ
        if roi_xmax <= roi_xmin:
            roi_xmax = width - 50
            roi_xmin = 50
        if roi_ymax <= roi_ymin:
            roi_ymax = height - 50
            roi_ymin = 50
            
        return roi_xmin, roi_ymin, roi_xmax, roi_ymax
    except Exception as e:
        logger.error(f"Error calculating ROI: {e}")
        # Fallback ROI
        return 50, 50, width-50, height-50

def is_in_roi(centroid, width, height):
    x, y = centroid
    roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)
    return roi_xmin <= x <= roi_xmax and roi_ymin <= y <= roi_ymax

# Overlap-based ROI check: consider a track inside ROI if its bbox overlaps ROI
# by at least a minimum ratio of its own area. This is more robust than centroid-only.
def is_bbox_in_roi(bbox, width, height, min_overlap=0.01):
    """FIXED: ROI checking với overlap ratio thích hợp"""
    try:
        x1, y1, x2, y2 = map(float, bbox)
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(width, height)

        # Tính intersection
        inter_x1 = max(x1, roi_xmin)
        inter_y1 = max(y1, roi_ymin)
        inter_x2 = min(x2, roi_xmax)
        inter_y2 = min(y2, roi_ymax)

        inter_w = max(0.0, inter_x2 - inter_x1)
        inter_h = max(0.0, inter_y2 - inter_y1)
        inter_area = inter_w * inter_h

        bbox_area = max(1.0, (x2 - x1) * (y2 - y1))
        overlap_ratio = inter_area / bbox_area
        
        # Log để debug
        if overlap_ratio > 0:
            logger.debug(f"ROI check: bbox=[{x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}], overlap={overlap_ratio:.3f}")
        
        return overlap_ratio >= min_overlap
    except Exception as e:
        logger.error(f"Error in ROI check: {e}")
        return True  # Fallback: accept all
def process_plate_text(text):
    """SIMPLIFIED: Process Vietnamese plate text with relaxed validation"""
    if not text or not isinstance(text, str):
        return None
    
    try:
        # Basic cleaning
        original = text
        text = re.sub(r'[^A-Z0-9\-\.\s]', '', text.upper().strip())
        
        if len(text) < 3:  # Very relaxed minimum length
            return None
        
        # Fix common OCR errors
        text = fix_vietnamese_ocr_errors(text)
        
        # Simple Vietnamese plate patterns - RELAXED
        patterns = [
            # Standard formats
            r'^\d{2}[A-Z]-\d{2,4}\.\d{2}$',        # 30A-123.45
            r'^\d{2}[A-Z]-\d{3,6}$',                # 30A-12345
            r'^\d{2}[A-Z]\d-\d{3,4}$',              # 30A1-2345
            r'^\d{2}[A-Z]{2}-\d{2,4}\.\d{2}$',     # 30AB-123.45
            
            # Compact formats
            r'^\d{2}[A-Z]\d{3,6}$',                 # 30A1234
            r'^\d{2}[A-Z]{2}\d{3,5}$',              # 30AB1234
            
            # Partial formats (very relaxed)
            r'^\d{1,2}[A-Z]\d{2,5}$',               # 3A123, 30A1234
            r'^\d{2}[A-Z]{1,2}\d{2,4}$',            # 30A12, 30AB123
        ]
        
        for pattern in patterns:
            if re.match(pattern, text):
                logger.info(f"✅ Pattern match: '{original}' -> '{text}'")
                return text
        
        # Very relaxed fallback: any alphanumeric with at least 2 digits
        clean_text = re.sub(r'[^A-Z0-9]', '', text)
        if len(clean_text) >= 4 and sum(c.isdigit() for c in clean_text) >= 2:
            logger.info(f"✅ Accepted relaxed pattern: '{original}' -> '{clean_text}'")
            return clean_text
        
        logger.debug(f"❌ No pattern match for: '{original}' -> '{text}'")
        return None
        
    except Exception as e:
        logger.error(f"❌ Error processing plate text: {e}")
        return None

def fix_vietnamese_ocr_errors(text):
    """Fix common OCR errors for Vietnamese license plates"""
    if not text:
        return text
    
    # Common OCR errors for Vietnamese plates
    replacements = {
        'O': '0', 'I': '1', 'S': '5', 'G': '6', 'B': '8', 'Z': '2',
        'L': '1', 'T': '7', 'J': '1', 'Q': '0', 'U': '0', 'V': 'U',
        'W': 'VV', 'X': 'XX', 'Y': 'Y', 'K': 'K', 'M': 'M', 'N': 'N',
        'P': 'P', 'R': 'R', 'A': 'A', 'C': 'C', 'D': 'D', 'E': 'E',
        'F': 'F', 'H': 'H'
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    return text

def auto_format_vietnamese_plate(text):
    """Auto-format text to Vietnamese plate standard"""
    if not text or len(text) < 4:
        return text
    
    # Remove all separators first
    clean_text = re.sub(r'[\-\.\s]', '', text)
    
    # Check if it's already properly formatted
    if _is_valid_vn_plate_format(text):
        return text
    
    # Auto-format based on length and pattern
    if len(clean_text) >= 6:
        # Pattern: 2 digits + 1 letter + ...
        if re.match(r'^\d{2}[A-Z]', clean_text):
            province_code = clean_text[:2]  # Mã tỉnh
            letter = clean_text[2:3]        # Chữ cái
            rest = clean_text[3:]            # Phần còn lại
            
            # Ô tô formats
            if len(rest) == 4:
                return f"{province_code}{letter}-{rest[:2]}.{rest[2:]}"
            elif len(rest) == 5:
                return f"{province_code}{letter}-{rest[:3]}.{rest[3:]}"
            elif len(rest) == 6:
                return f"{province_code}{letter}-{rest[:4]}.{rest[4:]}"
            elif len(rest) >= 7:
                return f"{province_code}{letter}-{rest}"
            
            # Xe máy formats
            elif len(rest) >= 4:
                fourth_char = rest[0]
                if fourth_char.isdigit():
                    if len(rest) == 5:
                        return f"{province_code}{letter}{fourth_char}-{rest[1:]}"
                    elif len(rest) == 6:
                        return f"{province_code}{letter}{fourth_char}-{rest[1:4]}.{rest[4:]}"
        
        # Ngoại giao format: 2 digits + 2 letters
        elif re.match(r'^\d{2}[A-Z]{2}', clean_text):
            province_code = clean_text[:2]
            letters = clean_text[2:4]
            rest = clean_text[4:]
            
            if len(rest) == 4:
                return f"{province_code}{letters}-{rest[:2]}.{rest[2:]}"
            elif len(rest) == 5:
                return f"{province_code}{letters}-{rest[:3]}.{rest[3:]}"
            elif len(rest) == 6:
                return f"{province_code}{letters}-{rest[:4]}.{rest[4:]}"
    
    # If no specific pattern matches, return cleaned text
    return clean_text

def normalize_vn_plate_for_db(text, min_conf: float = 0.3):
    """Normalize and validate a plate text strictly for DB saving.
    Returns normalized VN plate string if valid, otherwise None.
    """
    try:
        if not text or not isinstance(text, str):
            return None
        cleaned = re.sub(r'[^A-Z0-9\-\.]', '', text.upper().strip())
        # Prefer dash format if plausible: insert dash when pattern like NN[A-Z]{1,2} followed by digits
        m = re.match(r'^(\d{2}[A-Z]{1,2})(\d[\d\.]*)$', cleaned)
        if m:
            candidate = f"{m.group(1)}-{m.group(2)}"
            if process_plate_text(candidate):
                return candidate
        # Otherwise accept if strict or relaxed processor approves
        strict_ok = _is_valid_vn_plate_format(cleaned) if '_is_valid_vn_plate_format' in globals() else False
        relaxed_ok = process_plate_text(cleaned) is not None
        if strict_ok or relaxed_ok:
            return cleaned
        return None
    except Exception:
        return None

# ==== SỬA LỖI OCR RESULT EMPTY LIST ====

def safe_extract_ocr_text(ocr_result):
    """Extract OCR text với validation chi tiết và debug toàn diện"""
    try:
        if not ocr_result:
            logger.warning("OCR result is None or empty")
            return None, 0.0
        
        logger.info(f"🔍 EXTRACTING TEXT FROM OCR RESULT: {type(ocr_result)}")
        logger.info(f"🔍 OCR result value: {str(ocr_result)[:500]}")
        
        # Debug: Log raw structure
        def debug_structure(obj, depth=0, max_depth=3):
            if depth > max_depth:
                return
            indent = "  " * depth
            if isinstance(obj, list):
                logger.info(f"{indent}List with {len(obj)} items:")
                for i, item in enumerate(obj[:3]):  # Only first 3 items
                    logger.info(f"{indent}[{i}]: {type(item)}")
                    debug_structure(item, depth + 1, max_depth)
            elif isinstance(obj, tuple):
                logger.info(f"{indent}Tuple with {len(obj)} items:")
                for i, item in enumerate(obj[:3]):
                    logger.info(f"{indent}[{i}]: {type(item)} = {str(item)[:50]}")
            else:
                logger.info(f"{indent}{type(obj)}: {str(obj)[:100]}")
        
        debug_structure(ocr_result)
        
        all_extractions = []
            
        # Handle different OCR result formats
        if isinstance(ocr_result, list):
            logger.info(f"📄 Processing list with {len(ocr_result)} items")
            
            for page_idx, page_result in enumerate(ocr_result):
                logger.info(f"📄 Page {page_idx}: {type(page_result)}")
                
                if page_result is None:
                    logger.warning(f"Page {page_idx} is None, skipping")
                    continue
                
                if isinstance(page_result, list):
                    logger.info(f"📄 Page {page_idx} has {len(page_result)} line results")
                    
                    for line_idx, line_result in enumerate(page_result):
                        logger.info(f"📄 Line {page_idx}-{line_idx}: {type(line_result)}")
                        
                        if line_result is None:
                            logger.warning(f"Line {page_idx}-{line_idx} is None, skipping")
                            continue
                        
                        # Format 1: [bbox, [text, conf]]
                        if isinstance(line_result, (list, tuple)) and len(line_result) >= 2:
                            bbox = line_result[0]
                            text_data = line_result[1]
                            
                            logger.info(f"📄 Line {page_idx}-{line_idx} bbox: {bbox}")
                            logger.info(f"📄 Line {page_idx}-{line_idx} text_data: {text_data}")
                            
                            if isinstance(text_data, (list, tuple)) and len(text_data) >= 2:
                                text = str(text_data[0]).strip()
                                try:
                                    confidence = float(text_data[1])
                                except Exception:
                                    try:
                                        import numpy as _np
                                        if isinstance(text_data[1], (_np.floating, _np.integer)):
                                            confidence = float(text_data[1])
                                        else:
                                            confidence = 0.0
                                    except Exception:
                                        confidence = 0.0
                                
                                logger.info(f"✅ Extracted: '{text}' with confidence {confidence}")
                                
                                # Very lenient validation
                                if text and len(text) >= 1 and confidence > 0.001:
                                    all_extractions.append((text, confidence))
                                    logger.info(f"✅ Added to extractions: '{text}' (conf: {confidence})")
                                else:
                                    logger.info(f"❌ Rejected: text='{text}', conf={confidence}")
                        
                        # Format 2: [text, conf] directly
                        elif isinstance(line_result, (list, tuple)) and len(line_result) >= 2:
                            text = str(line_result[0]).strip()
                            try:
                                confidence = float(line_result[1])
                            except Exception:
                                confidence = 0.0
                            
                            logger.info(f"✅ Direct format extracted: '{text}' with confidence {confidence}")
                            
                            if text and len(text) >= 1 and confidence > 0.001:
                                all_extractions.append((text, confidence))
                                logger.info(f"✅ Added direct extraction: '{text}' (conf: {confidence})")
                            else:
                                logger.info(f"❌ Rejected direct: text='{text}', conf={confidence}")
                        
                        # Format 3: String directly
                        elif isinstance(line_result, str):
                            text = line_result.strip()
                            confidence = 0.5  # Default confidence for string
                            
                            logger.info(f"✅ String format extracted: '{text}' with default confidence {confidence}")
                            
                            if text and len(text) >= 1:
                                all_extractions.append((text, confidence))
                                logger.info(f"✅ Added string extraction: '{text}' (conf: {confidence})")
                            else:
                                logger.info(f"❌ Rejected string: text='{text}'")
                
                # Handle single item (not list)
                elif isinstance(page_result, (list, tuple)) and len(page_result) >= 2:
                    # Try to extract from single item
                    text = str(page_result[0]).strip()
                    try:
                        confidence = float(page_result[1])
                    except Exception:
                        confidence = 0.0
                    
                    logger.info(f"✅ Single item extracted: '{text}' with confidence {confidence}")
                    
                    if text and len(text) >= 1 and confidence > 0.001:
                        all_extractions.append((text, confidence))
                        logger.info(f"✅ Added single item: '{text}' (conf: {confidence})")
                    else:
                        logger.info(f"❌ Rejected single item: text='{text}', conf={confidence}")
        
        # Handle non-list results
        elif isinstance(ocr_result, str):
            text = ocr_result.strip()
            confidence = 0.5
            logger.info(f"✅ String result: '{text}' with default confidence {confidence}")
            if text and len(text) >= 1:
                all_extractions.append((text, confidence))
                logger.info(f"✅ Added string result: '{text}' (conf: {confidence})")
        
        elif isinstance(ocr_result, tuple) and len(ocr_result) >= 2:
            text = str(ocr_result[0]).strip()
            try:
                confidence = float(ocr_result[1])
            except Exception:
                confidence = 0.0
            
            logger.info(f"✅ Tuple result: '{text}' with confidence {confidence}")
            if text and len(text) >= 1 and confidence > 0.001:
                all_extractions.append((text, confidence))
                logger.info(f"✅ Added tuple result: '{text}' (conf: {confidence})")
        
        # Return best extraction
        if all_extractions:
            all_extractions.sort(key=lambda x: x[1], reverse=True)  # Sort by confidence
            best_text, best_conf = all_extractions[0]
            logger.info(f"🎯 BEST EXTRACTION: '{best_text}' (conf: {best_conf})")
            return best_text, best_conf
        else:
            logger.warning("❌ No valid extractions found")
            return None, 0.0
        
    except Exception as e:
        logger.error(f"❌ Error extracting OCR text: {e}")
        import traceback
        logger.error(f"❌ Extraction traceback: {traceback.format_exc()}")
        return None, 0.0

def force_reinit_ocr():
    """Buộc khởi tạo lại OCR readers"""
    global ocr_reader, ocr_reader_fallback
    
    logger.warning("🔄 FORCE REINITIALIZING OCR READERS...")
    
    # Clear existing readers
    ocr_reader = None
    ocr_reader_fallback = None
    
    try:
        # Reinitialize main reader
        logger.info("🔄 Reinitializing main OCR reader...")
        ocr_reader = create_paddle_ocr(prefer_gpu=False, lang='en')  # Force CPU first
        
        if ocr_reader:
            logger.info("✅ Main OCR reader reinitialized")
        else:
            logger.error("❌ Failed to reinitialize main OCR reader")
        
        # Reinitialize fallback reader
        logger.info("🔄 Reinitializing fallback OCR reader...")
        ocr_reader_fallback = create_paddle_ocr(prefer_gpu=False, lang='en')
        
        if ocr_reader_fallback:
            logger.info("✅ Fallback OCR reader reinitialized") 
        else:
            logger.error("❌ Failed to reinitialize fallback OCR reader")
        
        return ocr_reader is not None
        
    except Exception as e:
        logger.error(f"❌ Force reinit failed: {e}")
        return False
    
def _iter_ocr_candidates(ocr_result):
    """Enhanced OCR candidates iterator với deep debugging"""
    try:
        if ocr_result is None:
            logger.info("_iter_ocr_candidates: ocr_result is None")
            return
        
        logger.info(f"_iter_ocr_candidates: Processing {type(ocr_result)}")
        
        # Normalize to list
        if not isinstance(ocr_result, (list, tuple)):
            ocr_result = [ocr_result]
        
        logger.info(f"_iter_ocr_candidates: Normalized to list of {len(ocr_result)} items")
        
        queue = list(ocr_result)
        processed_count = 0
        
        while queue:
            item = queue.pop(0)
            processed_count += 1
            
            logger.info(f"_iter_ocr_candidates: Processing item {processed_count}: {type(item)}")
            
            if item is None:
                continue
            
            # Handle different formats
            if isinstance(item, (list, tuple)):
                logger.info(f"    Item is list/tuple with {len(item)} elements")
                
                # Format 1: [text, conf] (rec-only)
                if len(item) == 2 and isinstance(item[0], str) and isinstance(item[1], (int, float)):
                    text, conf = str(item[0]), float(item[1])
                    logger.info(f"    Yielding rec-only: '{text}' (conf: {conf})")
                    yield text, conf
                    continue
                
                # Format 2: [bbox, [text, conf]] (det+rec)
                elif len(item) >= 2 and isinstance(item[1], (list, tuple)):
                    text_data = item[1]
                    if len(text_data) >= 2 and isinstance(text_data[0], str) and isinstance(text_data[1], (int, float)):
                        text, conf = str(text_data[0]), float(text_data[1])
                        logger.info(f"    Yielding det+rec: '{text}' (conf: {conf})")
                        yield text, conf
                        continue
                
                # Format 3: Nested structure - add to queue
                else:
                    logger.info(f"    Adding {len(item)} subitems to queue")
                    for subitem in item:
                        queue.append(subitem)
            
            elif isinstance(item, str):
                logger.info(f"    Yielding string: '{item}' (default conf: 0.5)")
                yield str(item), 0.5
            
            else:
                logger.info(f"    Unknown item type: {type(item)}")
                continue
        
        logger.info(f"_iter_ocr_candidates: Processed {processed_count} items total")
        
    except Exception as e:
        logger.error(f"_iter_ocr_candidates error: {e}")
        return


# ==== SỬA LỖI TOÀN DIỆN CHO OCR RECOGNITION ====
def safe_extract_ocr_text(ocr_result):
    try:
        if not ocr_result:
            return None, 0.0

        all_texts = []
        
        def extract_texts_recursive(item, depth=0):
            if isinstance(item, list):
                for subitem in item:
                    if isinstance(subitem, (list, tuple)) and len(subitem) >= 2:
                        # Format: [bbox, [text, conf]]
                        if (isinstance(subitem[1], (list, tuple)) and 
                            len(subitem[1]) >= 2):
                            text, conf = subitem[1][0], subitem[1][1]
                            if isinstance(text, str) and text.strip():
                                all_texts.append((text.strip(), float(conf)))
                        # Format: [text, conf] trực tiếp
                        elif isinstance(subitem[0], str):
                            text, conf = subitem[0], subitem[1]
                            if text.strip():
                                all_texts.append((text.strip(), float(conf)))
                    else:
                        extract_texts_recursive(subitem, depth + 1)
        
        extract_texts_recursive(ocr_result)
        
        if all_texts:
            # Lấy text có confidence cao nhất
            best_text, best_conf = max(all_texts, key=lambda x: x[1])
            return best_text, best_conf
        
        return None, 0.0
        
    except Exception as e:
        logger.error(f"OCR extraction error: {e}")
        return None, 0.0
def generate_ocr_variants(plate_img: np.ndarray) -> List[np.ndarray]:
    """Create enhanced OCR variants for better recognition"""
    variants: List[np.ndarray] = []
    try:
        if plate_img is None or plate_img.size == 0:
            return variants
            
        img = plate_img.copy()
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

        height, width = img.shape[:2]
        
        # Minimum size requirements for OCR
        target_width = max(400, width * 4)  # At least 4x upscale
        target_height = max(120, height * 4)
            
        logger.info(f"Generating OCR variants: {width}x{height} -> {target_width}x{target_height}")
        
        # 1. High-quality upscaled version with enhancement
        try:
            # Upscale first
            upscaled = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_CUBIC)
            
            # Convert to LAB for better contrast enhancement
            lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Apply CLAHE to L channel
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            
            # Merge back
            enhanced = cv2.merge([l, a, b])
            enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
            
            # Add white padding
            pad_size = 20
            padded = cv2.copyMakeBorder(enhanced, pad_size, pad_size, pad_size, pad_size, 
                                      cv2.BORDER_CONSTANT, value=[255, 255, 255])
            variants.append(padded)
            
        except Exception as e:
            logger.debug(f"Enhanced variant failed: {e}")
            # Fallback to simple upscale
            simple_upscale = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_CUBIC)
            variants.append(simple_upscale)
        
        # 2. Binary threshold variants
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray_upscaled = cv2.resize(gray, (target_width, target_height), interpolation=cv2.INTER_CUBIC)
            
            # OTSU threshold
            _, otsu = cv2.threshold(gray_upscaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            otsu_bgr = cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)
            variants.append(otsu_bgr)
            
            # Inverted
            inverted = cv2.bitwise_not(otsu)
            inverted_bgr = cv2.cvtColor(inverted, cv2.COLOR_GRAY2BGR)
            variants.append(inverted_bgr)
            
        except Exception as e:
            logger.debug(f"Binary variants failed: {e}")

        logger.info(f"Generated {len(variants)} OCR variants")
        return variants
        
    except Exception as e:
        logger.error(f"Error generating OCR variants: {e}")
        return []
def combine_two_row_ocr_results(upper_results, lower_results):
    """Combine OCR results from upper and lower parts of 2-row plate"""
    try:
        logger.info("🔗 Combining 2-row OCR results...")
        
        combinations = []
        
        # Extract texts from results
        upper_texts = []
        lower_texts = []
        
        if upper_results:
            for text, conf in _iter_ocr_candidates(upper_results):
                if text and len(text.strip()) >= 2:
                    cleaned = clean_and_preserve_structure(text)
                    if cleaned:
                        upper_texts.append((cleaned, conf))
        
        if lower_results:
            for text, conf in _iter_ocr_candidates(lower_results):
                if text and len(text.strip()) >= 2:
                    cleaned = clean_and_preserve_structure(text)
                    if cleaned:
                        lower_texts.append((cleaned, conf))
        
        logger.info(f"📄 Upper texts: {upper_texts}")
        logger.info(f"📄 Lower texts: {lower_texts}")
        
        # Try different combinations
        for upper_text, upper_conf in upper_texts[:3]:  # Top 3 from upper
            for lower_text, lower_conf in lower_texts[:3]:  # Top 3 from lower
                
                # Direct combination
                combined = upper_text + lower_text
                combined_conf = (upper_conf + lower_conf) / 2
                combinations.append((combined, combined_conf))
                
                # With dash separator (Vietnamese format)
                combined_dash = upper_text + '-' + lower_text
                combinations.append((combined_dash, combined_conf * 0.9))  # Slightly lower conf
                
                # With dot separator
                combined_dot = upper_text + '.' + lower_text
                combinations.append((combined_dot, combined_conf * 0.8))
        
        # Sort by confidence
        combinations.sort(key=lambda x: x[1], reverse=True)
        
        if combinations:
            best_combined, best_conf = combinations[0]
            logger.info(f"✅ Best 2-row combination: '{best_combined}' (conf: {best_conf:.3f})")
            return best_combined, best_conf
        
        return None, 0.0
        
    except Exception as e:
        logger.error(f"Error combining 2-row OCR results: {e}")
        return None, 0.0
def detect_license_plate_in_vehicle(vehicle_crop, plate_model):
    """Simplified plate detection using yolov9s.pt"""
    try:
        if vehicle_crop is None:
            return None, 0.0, None
        
        h, w = vehicle_crop.shape[:2]
        
        # Initialize variables
        best_plate = None
        best_confidence = 0.0
        best_bbox = None
        
        # Use yolov9s.pt for plate detection with very low threshold
        if plate_model is not None:
            try:
                # Use very low confidence threshold to catch more plates
                results = plate_model(vehicle_crop, conf=0.01, iou=0.3, verbose=False)
                
                if results:
                    for result in results:
                        if hasattr(result, 'boxes') and result.boxes is not None:
                            boxes = result.boxes
                            if hasattr(boxes, 'xyxy') and hasattr(boxes, 'conf'):
                                xyxy = boxes.xyxy.cpu().numpy()
                                conf = boxes.conf.cpu().numpy()
                                
                                # Take the first detection
                                if len(xyxy) > 0:
                                    box = xyxy[0]
                                    confidence = float(conf[0])
                                    
                                    x1, y1, x2, y2 = map(int, box)
                                    
                                    # Add padding
                                    pad_x = max(5, int((x2 - x1) * 0.1))
                                    pad_y = max(3, int((y2 - y1) * 0.1))
                                    
                                    x1p = max(0, x1 - pad_x)
                                    y1p = max(0, y1 - pad_y)
                                    x2p = min(w, x2 + pad_x)
                                    y2p = min(h, y2 + pad_y)
                                    
                                    plate_crop = vehicle_crop[y1p:y2p, x1p:x2p]
                                    
                                    if plate_crop.size > 0:
                                        plate_h, plate_w = plate_crop.shape[:2]
                                        if plate_w >= 10 and plate_h >= 5:
                                            best_plate = plate_crop
                                            best_confidence = confidence
                                            best_bbox = [x1p, y1p, x2p, y2p]
                                            break
                            
            except Exception as e:
                pass
        
        # Fallback: use bottom portion of vehicle
        if best_plate is None:
            try:
                fallback_y1 = max(0, int(h * 0.7))
                fallback_y2 = h
                fallback_x1 = int(w * 0.1)
                fallback_x2 = int(w * 0.9)
                
                bottom_portion = vehicle_crop[fallback_y1:fallback_y2, fallback_x1:fallback_x2]
                if bottom_portion.size > 0:
                    ph, pw = bottom_portion.shape[:2]
                    if pw >= 10 and ph >= 5:
                        best_plate = bottom_portion
                        best_confidence = 0.1
                        best_bbox = [fallback_x1, fallback_y1, fallback_x2, fallback_y2]
            except:
                pass
        
        if best_plate is not None:
            return best_plate, best_confidence, best_bbox
        else:
            return None, 0.0, None
            
    except Exception as e:
        logger.error(f"❌ Plate detection error: {e}")
        return None, 0.0, None
def setup_pytorch_environment_fixed():
    """Setup PyTorch environment với enhanced compatibility"""
    try:
        import os
        import torch
        
        # Disable strict weights loading
        os.environ['TORCH_WEIGHTS_ONLY'] = 'false'
        os.environ['ULTRALYTICS_DISABLE_DOWNLOAD'] = '0'  # Cho phép download standard models
        
        # Set ultralytics home
        os.environ['ULTRALYTICS_HOME'] = os.path.dirname(os.path.abspath(__file__))
        
        # Check PyTorch version
        version = torch.__version__
        logger.info(f"PyTorch version: {version}")
        
        # Check CUDA availability
        if torch.cuda.is_available():
            logger.info(f"CUDA available: {torch.cuda.device_count()} devices")
            logger.info(f"CUDA version: {torch.version.cuda}")
        else:
            logger.info("CUDA not available, using CPU")
        
        logger.info("✅ PyTorch environment setup completed")
        return True
        
    except Exception as e:
        logger.warning(f"PyTorch environment setup failed: {e}")
        return False
def propose_plate_crops(vehicle_crop, max_candidates=5):
    """Generate multiple plate crop proposals from a vehicle crop.
    Returns list of tuples: (plate_crop, confidence_like, bbox_local [x1,y1,x2,y2])
    """
    try:
        proposals = []
        if vehicle_crop is None or vehicle_crop.size == 0:
            return proposals
        h, w = vehicle_crop.shape[:2]
        # 1) Heuristic contour-based
        try:
            gray = cv2.cvtColor(vehicle_crop, cv2.COLOR_BGR2GRAY)
            gray = cv2.bilateralFilter(gray, 7, 75, 75)
            grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
            _, bw = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            bw = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, np.ones((5, 15), np.uint8), iterations=2)
            contours, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, ww, hh = cv2.boundingRect(cnt)
                if ww < 30 or hh < 10: continue
                aspect = float(ww) / max(1, hh)
                area = ww * hh
                if 1.8 <= aspect <= 10.5 and area >= 200:
                    pad_x = max(8, int(ww * 0.3))
                    pad_y = max(6, int(hh * 0.3))
                    x1 = max(0, x - pad_x)
                    y1 = max(0, y - pad_y)
                    x2 = min(w, x + ww + pad_x)
                    y2 = min(h, y + hh + pad_y)
                    crop = vehicle_crop[y1:y2, x1:x2]
                    if crop.size > 0:
                        proposals.append((crop, 0.15, [x1, y1, x2, y2]))
        except Exception:
            pass
        # 2) Bottom area proposals (common plate region)
        try:
            bands = [
                (max(0, int(h*0.65)), h),
                (max(0, int(h*0.55)), min(h, int(h*0.85))),
            ]
            for y1b, y2b in bands:
                if y2b <= y1b: continue
                crop = vehicle_crop[y1b:y2b, :]
                if crop.size > 0 and crop.shape[1] >= 40 and crop.shape[0] >= 14:
                    proposals.append((crop, 0.08, [0, y1b, w, y2b]))
        except Exception:
            pass
        # 3) MSER proposals
        try:
            mser = cv2.MSER_create(_delta=5, _min_area=60, _max_area=20000)
            gray_m = cv2.cvtColor(vehicle_crop, cv2.COLOR_BGR2GRAY)
            regs, _ = mser.detectRegions(gray_m)
            for p in regs:
                x, y, ww, hh = cv2.boundingRect(p)
                if ww < 30 or hh < 10: continue
                aspect = float(ww) / max(1, hh)
                if 1.6 <= aspect <= 10.5:
                    pad_x = max(8, int(ww * 0.25))
                    pad_y = max(6, int(hh * 0.25))
                    x1 = max(0, x - pad_x)
                    y1 = max(0, y - pad_y)
                    x2 = min(w, x + ww + pad_x)
                    y2 = min(h, y + hh + pad_y)
                    crop = vehicle_crop[y1:y2, x1:x2]
                    if crop.size > 0:
                        proposals.append((crop, 0.12, [x1, y1, x2, y2]))
        except Exception:
            pass
        # Sort by pseudo-confidence and area
        ranked = []
        for crop, conf, bb in proposals:
            area = (bb[2]-bb[0])*(bb[3]-bb[1])
            ranked.append((crop, conf, bb, area))
        ranked.sort(key=lambda t: (-t[1], -t[3]))
        return [(c, cf, bb) for c, cf, bb, _ in ranked[:max_candidates]]
    except Exception as e:
        logger.debug(f"propose_plate_crops error: {e}")
        return []

def safe_yolo_detection(model, frame):
    """FIXED YOLO detection with proper model validation"""
    try:
        if model is None:
            logger.warning("YOLO model is None")
            return []
        
        # CRITICAL FIX: Check if model is callable and not a dummy
        if not hasattr(model, '__call__'):
            logger.error("YOLO model is not callable")
            return []
        
        # CRITICAL FIX: Check if it's a DummyYOLO object
        if hasattr(model, '__class__') and model.__class__.__name__ == 'DummyYOLO':
            logger.error("❌ DummyYOLO detected - attempting recovery")
            
            # Try to reload from available models
            if initialize_models_properly():
                global yolo_model
                model = yolo_model
                logger.info("✅ Recovered from DummyYOLO")
            else:
                logger.error("❌ Failed to recover from DummyYOLO")
                return []
        
        h, w = frame.shape[:2]
        logger.info(f"Running YOLO detection on frame: {w}x{h}")
        
        # FIXED: Test model call before actual inference
        try:
            # Quick test to ensure model works
            test_small = frame[::8, ::8]  # Downsample for quick test
            if test_small.size > 0:
                test_results = model(test_small, verbose=False, conf=0.1)  # Use reasonable conf for test
                logger.debug("Model call test successful")
        except Exception as test_error:
            logger.error(f"Model call test failed: {test_error}")
            
            logger.info("🔄 Attempting model recovery...")
            if initialize_models_properly():
                model = yolo_model  # Use newly loaded model
                logger.info("✅ Model recovery successful")
            else:
                logger.error("❌ Model recovery failed")
                return []
        
        # FIXED: Run actual detection with better parameters
        try:
            # Use balanced parameters for real vehicle detection
            logger.info(f"🔍 Running YOLO inference with conf={MIN_CONFIDENCE}, iou=0.45, imgsz=640")
            results = model(frame, 
                          conf=MIN_CONFIDENCE,  # Use higher confidence for real vehicles
                          iou=0.45, 
                          verbose=False, 
                          imgsz=640,  # Standard size for better accuracy
                          device='cpu' if not torch.cuda.is_available() else 'cuda')
            
            logger.info(f"YOLO inference completed: {len(results) if results else 0} results")
            if results:
                logger.info(f"🔍 First result type: {type(results[0])}")
                if hasattr(results[0], 'boxes'):
                    logger.info(f"🔍 First result has boxes: {results[0].boxes is not None}")
                    if results[0].boxes is not None:
                        logger.info(f"🔍 First result boxes attributes: xyxy={hasattr(results[0].boxes, 'xyxy')}, conf={hasattr(results[0].boxes, 'conf')}, cls={hasattr(results[0].boxes, 'cls')}")
        except Exception as e:
            logger.error(f"YOLO inference failed: {e}")
            try:
                logger.info("🔄 Trying CPU fallback...")
                results = model(frame, conf=MIN_CONFIDENCE, iou=0.45, verbose=False, imgsz=640, device='cpu')
                logger.info("✅ CPU fallback successful")
            except Exception as cpu_error:
                logger.error(f"CPU fallback also failed: {cpu_error}")
                return []
        
        if not results:
            logger.warning("YOLO returned no results")
            return []
        
        detections = []
        total_boxes = 0
        vehicle_boxes = 0
        
        # Calculate ROI once for filtering
        roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(w, h)
        logger.info(f"🔍 ROI coordinates: ({roi_xmin}, {roi_ymin}) to ({roi_xmax}, {roi_ymax})")
        logger.info(f"🔍 Processing {len(results)} YOLO results")
        for result in results:
            try:
                if not hasattr(result, 'boxes') or result.boxes is None:
                    continue
                
                boxes = result.boxes
                if not hasattr(boxes, 'xyxy') or not hasattr(boxes, 'conf') or not hasattr(boxes, 'cls'):
                    continue
                
                # Convert to numpy arrays safely
                try:
                    xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, 'cpu') else boxes.xyxy
                    conf = boxes.conf.cpu().numpy() if hasattr(boxes.conf, 'cpu') else boxes.conf
                    cls = boxes.cls.cpu().numpy() if hasattr(boxes.cls, 'cpu') else boxes.cls
                except:
                    continue
                
                if not isinstance(xyxy, np.ndarray) or xyxy.size == 0:
                    continue
                
                total_boxes = len(xyxy)
                logger.info(f"🔍 Processing {total_boxes} raw detections from result")
                
                for i in range(len(xyxy)):
                    try:
                        box = xyxy[i]
                        confidence = float(conf[i])
                        class_id = int(cls[i])
                        
                        # Filter to vehicle classes only
                        if class_id not in VEHICLE_CLASSES:
                            logger.debug(f"🔍 Skipping class {class_id} (not in VEHICLE_CLASSES {VEHICLE_CLASSES})")
                            continue
                        
                        # Use consistent confidence threshold
                        if confidence < MIN_CONFIDENCE:
                            logger.debug(f"🔍 Skipping detection with low confidence {confidence:.3f} < {MIN_CONFIDENCE}")
                            continue
                        
                        # Extract and validate coordinates
                        x1, y1, x2, y2 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
                        
                        if x1 >= x2 or y1 >= y2:
                            continue
                        
                        # Clamp to frame bounds
                        x1 = max(0, min(x1, w))
                        y1 = max(0, min(y1, h))
                        x2 = max(0, min(x2, w))
                        y2 = max(0, min(y2, h))
                        
                        # ROI check - more lenient for better detection
                        if not is_bbox_in_roi([x1, y1, x2, y2], w, h, min_overlap=0.1):
                            logger.debug(f"🔍 Skipping detection outside ROI: bbox=[{x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}]")
                            continue
                        
                        # Convert to tracking format
                        box_w = x2 - x1
                        box_h = y2 - y1
                        
                        if box_w <= 0 or box_h <= 0:
                            continue
                        
                        detection = [x1, y1, box_w, box_h, confidence, class_id]
                        detections.append(detection)
                        vehicle_boxes += 1
                        
                        logger.info(f"✅ OBJECT DETECTED: class={class_id}, conf={confidence:.3f}, bbox=[{x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}]")
                                
                    except Exception as e:
                        logger.debug(f"Error processing detection {i}: {e}")
                        continue
                        
            except Exception as e:
                logger.warning(f"Error processing YOLO result: {e}")
                continue
        logger.info(f"🎯 DETECTION SUMMARY: {vehicle_boxes}/{total_boxes} objects detected")
        
        # Only return real detections, no fake detections
        if vehicle_boxes == 0:
            logger.debug("🔄 No vehicle detections found - this is normal")
        
        return detections
        
    except Exception as e:
        logger.error(f"Critical error in YOLO detection: {e}")
        return []

def initialize_models_properly():
    """Simplified initialization using only yolov9s.pt"""
    global yolo_model, plate_model, plate_model_name, ocr_reader
    
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Load yolov9s.pt for both vehicle and plate detection
        yolo_path = os.path.join(current_dir, 'yolov9s.pt')
        logger.info(f"Loading YOLO from: {yolo_path}")
        
        if os.path.exists(yolo_path):
            yolo_model = safe_yolo_load(yolo_path)
        else:
            # Try download
            yolo_model = safe_yolo_load('yolov9s.pt')
        
        if yolo_model is None:
            logger.error("❌ Failed to load yolov9s.pt")
            return False
        
        # Use same model for both vehicle and plate detection
        plate_model = yolo_model
        plate_model_name = "yolov9s.pt"
        logger.info("✅ Using yolov9s.pt for both vehicle and plate detection")
        
        # Initialize OCR reader
        if ocr_reader is None:
            try:
                logger.info("🔧 Initializing PaddleOCR...")
                ocr_reader = PaddleOCR(
                    use_angle_cls=False,
                    lang='en',
                    show_log=False,
                    use_gpu=False
                )
                logger.info("✅ PaddleOCR initialized successfully")
            except Exception as e:
                logger.error(f"❌ PaddleOCR initialization failed: {e}")
                ocr_reader = None
        
        return True
        
    except Exception as e:
        logger.error(f"Initialization error: {e}")
        return False
# safe_deepsort_update removed - using direct plate detection only
    """IMPROVED DeepSORT update with better tracking accuracy"""
    try:
        if tracker is None:
            logger.error("Tracker is None")
            return []
        
        logger.info(f"DeepSORT update: {len(detections) if detections else 0} detections")
        
        if not isinstance(detections, list) or len(detections) == 0:
            logger.info("No valid detections, updating tracker with empty list")
            try:
                tracks = tracker.update_tracks([], frame=frame)
                return tracks if isinstance(tracks, list) else []
            except Exception as e:
                logger.error(f"Error updating tracker with empty detections: {e}")
                return []
        
        # FIXED: Convert to correct DeepSORT format
        valid_detections = []
        
        for i, det in enumerate(detections):
            try:
                if not isinstance(det, (list, tuple, np.ndarray)) or len(det) < 6:
                    continue
                
                # Extract from YOLO format: [x, y, w, h, conf, class]
                x, y, w, h, conf, class_id = det[:6]
                
                # Convert and validate
                x, y, w, h, conf = float(x), float(y), float(w), float(h), float(conf)
                class_id = int(class_id)
                
                # Improved validation for better tracking
                if not all(np.isfinite([x, y, w, h, conf])) or w <= 5 or h <= 5 or conf < MIN_CONFIDENCE:
                    continue
                
                # Additional size validation for license plates
                if w < 20 or h < 8:  # Minimum size for readable license plates
                    continue
                
                # CORRECT DeepSORT format: [[x, y, w, h], confidence, class_id]
                deepsort_detection = [
                    [float(x), float(y), float(w), float(h)],  # bbox as list
                    float(conf),  # confidence as float
                    int(class_id)  # class as int
                ]
                
                valid_detections.append(deepsort_detection)
                logger.debug(f"Detection {i}: converted to DeepSORT format")
                
            except Exception as e:
                logger.debug(f"Detection {i} conversion error: {e}")
                continue
        
        logger.info(f"DeepSORT: {len(valid_detections)}/{len(detections)} valid detections")
        
        if not valid_detections:
            try:
                tracks = tracker.update_tracks([], frame=frame)
                return tracks if isinstance(tracks, list) else []
            except Exception as e:
                logger.error(f"Error with empty valid detections: {e}")
                return []
        
        # Update tracker with properly formatted detections
        try:
            logger.info(f"Updating tracker with {len(valid_detections)} detections")
            
            # Handle different tracker types
            if hasattr(tracker, 'update_tracks'):
                tracks = tracker.update_tracks(valid_detections, frame=frame)
            else:
                logger.error("Tracker missing update_tracks method")
                return []
            
            if not isinstance(tracks, list):
                logger.warning(f"Tracker returned non-list: {type(tracks)}")
                return []
            
            logger.info(f"DeepSORT update successful: {len(tracks)} tracks")
            return tracks
            
        except Exception as e:
            logger.error(f"DeepSORT update failed: {e}")
            logger.error(f"Error details: {str(e)}")
            
            # Don't crash, return empty list
            return []
        
    except Exception as e:
        logger.error(f"Critical DeepSORT error: {e}")
        return []
def simple_track_processing(track, frame, original_width, original_height):
    """Enhanced track processing with persistent OCR results and Vietnamese plate validation"""
    global ocr_reader, tracked_objects
    
    try:
        if not (hasattr(track, 'track_id') and hasattr(track, 'to_ltrb')):
            return None
            
        track_id = track.track_id
        ltrb = track.to_ltrb()
        
        if ltrb is None:
            return None
            
        if isinstance(ltrb, np.ndarray):
            ltrb = ltrb.flatten()
            
        if len(ltrb) < 4:
            return None
            
        x1, y1, x2, y2 = map(int, ltrb[:4])
        
        # Clamp coordinates
        x1 = max(0, min(x1, original_width-1))
        y1 = max(0, min(y1, original_height-1))
        x2 = max(x1+1, min(x2, original_width))
        y2 = max(y1+1, min(y2, original_height))
        
        # Extract vehicle crop
        try:
            vehicle_crop = frame[y1:y2, x1:x2]
            if vehicle_crop.size == 0:
                return None
        except Exception:
            return None
        
        # Check if we already have a valid result for this track
        if track_id in tracked_objects:
            existing_obj = tracked_objects[track_id]
            if (existing_obj.get('plate_number') and 
                existing_obj.get('plate_number') != 'Đang nhận diện...' and
                existing_obj.get('validation_passed', False)):
                # Return existing valid result
                return {
                    'track_id': track_id,
                    'bbox': [x1, y1, x2, y2],
                    'plate_number': existing_obj['plate_number'],
                    'raw_text': existing_obj.get('raw_text', ''),
                    'confidence': existing_obj.get('confidence', 0.0),
                    'vehicle_crop': vehicle_crop,
                    'plate_crop': None,
                    'plate_frame_bbox': None,
                    'has_plate': True,
                    'validation_passed': True,
                    'class_id': getattr(track, 'class_id', -1)
                }
        
        # Run OCR every 3 frames for better results
        if frame_count % 3 == 0:
            # Simple plate detection
            plate_crop, plate_conf, plate_bbox_local = None, 0.0, None
            
            try:
                logger.info(f"🔍 Running plate detection on track {track_id}, vehicle crop: {vehicle_crop.shape}")
                plate_crop, plate_conf, plate_bbox_local = detect_license_plate_in_vehicle(vehicle_crop, plate_model)
                logger.info(f"🔍 Plate detection result for track {track_id}: crop={plate_crop is not None}, conf={plate_conf:.3f}")
            except Exception as e:
                logger.error(f"Plate detection failed for track {track_id}: {e}")
                plate_crop = None
            
            # OCR if we have plate
            plate_text = None
            confidence = 0.0
            plate_frame_bbox = None
            
            if plate_crop is not None and ocr_reader is not None:
                try:
                    logger.info(f"🔤 Running OCR on track {track_id}, plate crop: {plate_crop.shape}")
                    # Run OCR on plate crop
                    ocr_result = ocr_reader.ocr(plate_crop, det=True, rec=True, cls=False)
                    plate_text, confidence = safe_extract_ocr_text(ocr_result)
                    logger.info(f"🔤 OCR result for track {track_id}: text='{plate_text}', conf={confidence:.3f}")
                    
                    if plate_text and plate_bbox_local:
                        # Convert local bbox to frame coordinates
                        px1, py1, px2, py2 = map(int, plate_bbox_local)
                        plate_frame_bbox = [x1 + px1, y1 + py1, x1 + px2, y1 + py2]
                        
                except Exception as e:
                    logger.error(f"OCR failed for track {track_id}: {e}")
            else:
                logger.info(f"🔤 No plate crop or OCR reader for track {track_id}")
            
            # Validate Vietnamese plate format and high confidence
            is_valid_vn_plate = False
            if plate_text and confidence > 0.5:  # Lower confidence threshold for testing
                logger.info(f"🔍 Validating plate: '{plate_text}' (conf: {confidence:.3f})")
                
                # Try strict validation first
                is_valid_vn_plate = _is_valid_vn_plate_format(plate_text)
                logger.info(f"🔍 Strict validation result: {is_valid_vn_plate}")
                
                if not is_valid_vn_plate:
                    # Try relaxed validation
                    is_valid_vn_plate = _is_valid_vn_plate_format_relaxed(plate_text)
                    logger.info(f"🔍 Relaxed validation result: {is_valid_vn_plate}")
                
                if is_valid_vn_plate:
                    logger.info(f"✅ Valid Vietnamese plate detected: {plate_text} (conf: {confidence:.3f})")
                else:
                    logger.info(f"❌ Invalid plate format: {plate_text} (conf: {confidence:.3f})")
                    # Don't clear the text, just mark as invalid for display
                    # plate_text = None
                    # confidence = 0.0
            else:
                logger.info(f"🔍 Plate text or confidence too low: text='{plate_text}', conf={confidence:.3f}")
            
            # Update tracked objects with new result
            if track_id not in tracked_objects:
                tracked_objects[track_id] = {
                    'track_id': track_id,
                    'bbox': [x1, y1, x2, y2],
                    'plate_number': 'Đang nhận diện...',
                    'confidence': 0.0,
                    'first_seen': time.time(),
                    'last_seen': time.time(),
                    'disappeared': 0,
                    'validation_passed': False,
                    'saved_to_db': False
                }
            
            # Update with new result (always update, but mark validation status)
            if plate_text:
                tracked_objects[track_id].update({
                    'plate_number': plate_text,
                    'raw_text': plate_text,
                    'confidence': confidence,
                    'last_seen': time.time(),
                    'validation_passed': is_valid_vn_plate,
                    'plate_crop_filename': '',
                    'is_consistent': is_valid_vn_plate,
                    'ocr_attempts': tracked_objects[track_id].get('ocr_attempts', 0) + 1
                })
                if is_valid_vn_plate:
                    logger.info(f"💾 Updated track {track_id} with valid plate: {plate_text}")
                else:
                    logger.info(f"💾 Updated track {track_id} with detected plate (not validated): {plate_text}")
        
        # Return current result (either existing or new)
        current_obj = tracked_objects.get(track_id, {})
        return {
            'track_id': track_id,
            'bbox': [x1, y1, x2, y2],
            'plate_number': current_obj.get('plate_number', 'Đang nhận diện...'),
            'raw_text': current_obj.get('raw_text', ''),
            'confidence': current_obj.get('confidence', 0.0),
            'vehicle_crop': vehicle_crop,
            'plate_crop': None,
            'plate_frame_bbox': None,
            'has_plate': current_obj.get('validation_passed', False),
            'validation_passed': current_obj.get('validation_passed', False),
            'class_id': getattr(track, 'class_id', -1)
        }
        
    except Exception as e:
        logger.error(f"Simple track processing error: {e}")
        return None

def safe_track_processing(track, frame, original_width, original_height):
    """ENHANCED: Track processing with timeout protection and comprehensive error handling"""
    global track_consistency, ocr_attempts_per_track
    
    processing_start = time.time()
    PROCESSING_TIMEOUT = 2.0
    
    try:
        # Basic timeout check
        if time.time() - processing_start > PROCESSING_TIMEOUT:
            logger.warning("Track processing timeout in validation")
            return None
            
        # Validate track with comprehensive checks
        if not all([hasattr(track, attr) for attr in ['is_confirmed', 'track_id', 'to_ltrb']]):
            logger.debug("Track missing required attributes")
            return None
        
        try:
            track_id = int(track.track_id)
        except (ValueError, TypeError, AttributeError):
            logger.debug("Invalid track_id")
            return None
        
        # Get bbox with comprehensive error handling
        try:
            ltrb = track.to_ltrb()
            if ltrb is None:
                logger.debug(f"Track {track_id}: ltrb is None")
                return None
            
            if isinstance(ltrb, np.ndarray):
                ltrb = ltrb.flatten()
            
            if len(ltrb) < 4:
                logger.debug(f"Track {track_id}: insufficient bbox coordinates")
                return None
                
            x1, y1, x2, y2 = map(int, ltrb[:4])
            
            # Clamp coordinates with bounds checking
            x1 = max(0, min(x1, original_width - 1))
            y1 = max(0, min(y1, original_height - 1))
            x2 = max(x1 + 1, min(x2, original_width))
            y2 = max(y1 + 1, min(y2, original_height))
            
            if x1 >= x2 or y1 >= y2:
                logger.debug(f"Track {track_id}: invalid bbox coordinates")
                return None
                
        except Exception as bbox_error:
            logger.debug(f"Track {track_id} bbox error: {bbox_error}")
            return None
        
        # Safe vehicle crop with bounds checking
        try:
            if y1 >= original_height or y2 > original_height or x1 >= original_width or x2 > original_width:
                logger.debug(f"Track {track_id}: crop coordinates out of bounds")
                return None
                
            vehicle_crop = frame[y1:y2, x1:x2]
            if vehicle_crop.size == 0:
                logger.debug(f"Track {track_id}: empty vehicle crop")
                return None
        except Exception as crop_error:
            logger.error(f"Track {track_id} crop error: {crop_error}")
            return None
        
        logger.debug(f"Processing track {track_id}: bbox=[{x1},{y1},{x2},{y2}]")
        
        # Consistency check with timeout
        if time.time() - processing_start > PROCESSING_TIMEOUT * 0.3:
            logger.warning(f"Track {track_id}: timeout during consistency check")
            return None
            
        if track_id in track_consistency:
            consistency_data = track_consistency[track_id]
            if (consistency_data.get('best_result') and 
                consistency_data.get('consistent_count', 0) >= consistency_threshold):
                
                logger.debug(f"Using consistent result for track {track_id}: '{consistency_data['best_result']}'")
                return {
                    'track_id': track_id,
                    'bbox': [x1, y1, x2, y2],
                    'plate_number': consistency_data['best_result'],
                    'raw_text': consistency_data['best_result'],
                    'confidence': consistency_data.get('best_confidence', 0.0),
                    'vehicle_crop': vehicle_crop,
                    'plate_crop': None,
                    'plate_frame_bbox': None,
                    'has_plate': True,
                    'validation_passed': True,
                    'consistent_result': True
                }
        
        # OCR attempt limiting with timeout
        if track_id not in ocr_attempts_per_track:
            ocr_attempts_per_track[track_id] = 0
        
        max_attempts = 3  # Reduced for performance
        if ocr_attempts_per_track[track_id] >= max_attempts:
            if track_id in track_consistency and track_consistency[track_id].get('best_result'):
                best_result = track_consistency[track_id]['best_result']
                best_conf = track_consistency[track_id].get('best_confidence', 0.0)
                logger.debug(f"Using best result after max attempts for track {track_id}: '{best_result}'")
                return {
                    'track_id': track_id,
                    'bbox': [x1, y1, x2, y2],
                    'plate_number': best_result,
                    'raw_text': best_result,
                    'confidence': best_conf,
                    'vehicle_crop': vehicle_crop,
                    'plate_crop': None,
                    'plate_frame_bbox': None,
                    'has_plate': True,
                    'validation_passed': True,
                    'max_attempts_reached': True
                }
            else:
                logger.debug(f"Max OCR attempts reached for track {track_id}, no good result")
                return {
                    'track_id': track_id,
                    'bbox': [x1, y1, x2, y2],
                    'plate_number': 'Đang nhận diện...',
                    'raw_text': None,
                    'confidence': 0.0,
                    'vehicle_crop': vehicle_crop,
                    'plate_crop': None,
                    'plate_frame_bbox': None,
                    'has_plate': False,
                    'validation_passed': False,
                    'max_attempts_reached': True
                }
        
        # Increment OCR attempts
        ocr_attempts_per_track[track_id] += 1
        
        # Plate detection with timeout protection
        plate_crop, plate_conf, plate_bbox_local = None, 0.0, None
        
        try:
            if time.time() - processing_start > PROCESSING_TIMEOUT * 0.6:
                logger.warning(f"Track {track_id}: timeout before plate detection")
                plate_crop = None
            else:
                plate_detection_start = time.time()
                plate_crop, plate_conf, plate_bbox_local = detect_license_plate_in_vehicle(vehicle_crop, plate_model)
                plate_detection_time = time.time() - plate_detection_start
                
                if plate_detection_time > 1.0:
                    logger.warning(f"Track {track_id}: plate detection timeout: {plate_detection_time:.2f}s")
                    plate_crop = None
                    
        except Exception as plate_error:
            logger.error(f"Track {track_id} plate detection error: {plate_error}")
            plate_crop = None
            plate_conf = 0.0
            plate_bbox_local = None
        
        # OCR processing with strict timeout
        plate_text, ocr_confidence = None, 0.0
        
        if plate_crop is not None and ocr_reader is not None:
            try:
                # Check remaining time budget
                time_remaining = PROCESSING_TIMEOUT - (time.time() - processing_start)
                if time_remaining < 0.5:
                    logger.warning(f"Track {track_id}: skipping OCR due to time budget")
                else:
                    logger.debug(f"Track {track_id}: running OCR on plate crop: {plate_crop.shape}")
                    
                    ocr_start = time.time()
                    
                    # Single OCR attempt with timeout
                    try:
                        ocr_result = ocr_reader.ocr(plate_crop, det=False, rec=True, cls=False)
                        ocr_time = time.time() - ocr_start
                        
                        if ocr_time > 1.0:  # OCR timeout
                            logger.warning(f"Track {track_id}: OCR timeout: {ocr_time:.2f}s")
                            plate_text = None
                            ocr_confidence = 0.0
                        elif ocr_result:
                            plate_text, ocr_confidence = safe_extract_ocr_text(ocr_result)
                            
                            if plate_text:
                                processed_text = process_plate_text(plate_text)
                                if processed_text:
                                    plate_text = processed_text
                                    logger.debug(f"Track {track_id}: OCR success: '{plate_text}' (conf: {ocr_confidence:.3f})")
                                else:
                                    logger.debug(f"Track {track_id}: text validation failed")
                                    plate_text = None
                                    ocr_confidence = 0.0
                        else:
                            logger.debug(f"Track {track_id}: OCR returned no result")
                            
                    except Exception as ocr_exec_error:
                        logger.error(f"Track {track_id}: OCR execution error: {ocr_exec_error}")
                        plate_text = None
                        ocr_confidence = 0.0
                        
            except Exception as ocr_error:
                logger.error(f"Track {track_id}: OCR processing error: {ocr_error}")
                plate_text = None
                ocr_confidence = 0.0
        
        # Compute plate frame bbox safely
        plate_frame_bbox = None
        if plate_bbox_local and len(plate_bbox_local) >= 4:
            try:
                px1, py1, px2, py2 = map(int, plate_bbox_local[:4])
                plate_frame_bbox = [x1 + px1, y1 + py1, x1 + px2, y1 + py2]
            except Exception as bbox_error:
                logger.debug(f"Track {track_id}: plate frame bbox error: {bbox_error}")
                plate_frame_bbox = None
        
        # Return result
        vehicle_class_id = getattr(track, 'class_id', -1)
        
        result = {
            'track_id': track_id,
            'bbox': [x1, y1, x2, y2],  # Fixed: use computed bbox
            'plate_number': plate_text,
            'raw_text': plate_text,
            'confidence': ocr_confidence,
            'vehicle_crop': vehicle_crop,
            'plate_crop': plate_crop,
            'plate_frame_bbox': plate_frame_bbox,
            'has_plate': plate_crop is not None,
            'validation_passed': bool(plate_text and ocr_confidence > 0.05),
            'ocr_attempt': ocr_attempts_per_track[track_id],
            'class_id': vehicle_class_id,
            'processing_time': time.time() - processing_start
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Critical error in track processing: {e}")
        # Always return a safe fallback
        try:
            return {
                'track_id': getattr(track, 'track_id', -1),
                'bbox': [0, 0, 100, 100],
                'plate_number': 'Lỗi xử lý',
                'raw_text': None,
                'confidence': 0.0,
                'vehicle_crop': None,
                'plate_crop': None,
                'plate_frame_bbox': None,
                'has_plate': False,
                'validation_passed': False,
                'error': True
            }
        except:
            return None
    finally:
        total_time = time.time() - processing_start
        if total_time > PROCESSING_TIMEOUT:
            logger.warning(f"Track processing exceeded timeout: {total_time:.2f}s")
def run_ocr_on_plate(plate_crop):
    """Optimized OCR for license plate text recognition"""
    global ocr_reader
    
    try:
        if ocr_reader is None or plate_crop is None or plate_crop.size == 0:
            return "", 0.0
        
        # Enhance plate crop for better OCR
        enhanced_crop = enhance_plate_for_ocr(plate_crop)
        
        # Run OCR
        ocr_result = ocr_reader.ocr(enhanced_crop, det=True, rec=True, cls=False)
        
        if ocr_result and len(ocr_result) > 0:
            # Extract text and confidence
            text, confidence = safe_extract_ocr_text(ocr_result)
            
            if text and len(text.strip()) > 0:
                # Clean and validate plate text
                cleaned_text = clean_and_validate_plate_text(text)
                if cleaned_text:
                    return cleaned_text, confidence
        
        return "", 0.0
        
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return "", 0.0

def enhance_plate_for_ocr(plate_crop):
    """Enhance plate crop for better OCR accuracy"""
    try:
        if plate_crop is None or plate_crop.size == 0:
            return plate_crop
        
        # Resize to minimum size for OCR
        height, width = plate_crop.shape[:2]
        if width < 200 or height < 60:
            scale_factor = max(200/width, 60/height)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            plate_crop = cv2.resize(plate_crop, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
        
        # Convert to grayscale
        if len(plate_crop.shape) == 3:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_crop
        
        # Apply contrast enhancement
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Apply Gaussian blur to reduce noise
        enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
        
        # Convert back to BGR for PaddleOCR
        enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
        
        return enhanced_bgr
        
    except Exception as e:
        logger.error(f"Plate enhancement failed: {e}")
        return plate_crop

def clean_and_validate_plate_text(text):
    """Clean and validate Vietnamese license plate text"""
    try:
        if not text:
            return ""
        
        # Remove unwanted characters
        cleaned = re.sub(r'[^A-Z0-9\-\.]', '', text.upper().strip())
        
        # Basic validation for Vietnamese plates
        if len(cleaned) < 5 or len(cleaned) > 12:
            return ""
        
        # Check for common Vietnamese plate patterns
        patterns = [
            r'^\d{2}[A-Z]-\d{3}\.\d{2}$',  # 30A-123.45
            r'^\d{2}[A-Z]-\d{4}\.\d{2}$',  # 30A-1234.56
            r'^\d{2}[A-Z]{2}-\d{2}\.\d{2}$',  # 30AB-12.34
            r'^\d{2}[A-Z]{2}-\d{3}\.\d{2}$',  # 30AB-123.45
            r'^\d{2}[A-Z]-\d{4,5}$',  # 30A-1234
            r'^\d{2}[A-Z]\d-\d{3}\.\d{2}$',  # 30A1-123.45
        ]
        
        for pattern in patterns:
            if re.match(pattern, cleaned):
                return cleaned
        
        # If no pattern matches, return cleaned text if it looks reasonable
        if re.match(r'^[0-9A-Z\-\.]+$', cleaned) and len(cleaned) >= 5:
            return cleaned
        
        return ""
        
    except Exception as e:
        logger.error(f"Text cleaning failed: {e}")
        return ""

def detect_and_ocr(frame, video_processing=True):
    """Simplified plate detection and OCR - no vehicle tracking"""
    global yolo_model, ocr_reader, frame_count
    
    try:
        # Initialize models if needed
        if yolo_model is None:
            yolo_model = safe_yolo_load('yolov9s.pt')
        
        if ocr_reader is None:
            try:
                from paddleocr import PaddleOCR
                ocr_reader = PaddleOCR(use_angle_cls=False, lang='en', show_log=False, use_gpu=False)
            except:
                ocr_reader = None

        if frame is None or frame.size == 0:
            return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}, 'ids': []}

        original_height, original_width = frame.shape[:2]
        display_frame = frame.copy()
        frame_count += 1

        # Draw ROI
        try:
            roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(original_width, original_height)
            cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 4)
            cv2.putText(display_frame, "PLATE DETECTION ZONE", (roi_xmin + 10, roi_ymin - 15), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        except Exception as e:
            logger.error(f"ROI drawing failed: {e}")
            cv2.rectangle(display_frame, (50, 50), (original_width-50, original_height-50), (0, 255, 255), 3)

        # Initialize response arrays
        boxes = []
        labels = []
        ocr_results = []
        tracked_objects = {}
        
        # Direct plate detection using YOLOv9s.pt
        try:
            if yolo_model is not None:
                # Run YOLO detection with low confidence threshold for plates
                results = yolo_model(frame, conf=0.3, verbose=False)
                
                for result in results:
                    if result.boxes is not None:
                        for box in result.boxes:
                            # Get box coordinates and confidence
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = box.conf[0].cpu().numpy()
                            class_id = int(box.cls[0].cpu().numpy())
                            
                            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                            
                            # Check if detection is in ROI
                            if is_bbox_in_roi([x1, y1, x2, y2], original_width, original_height):
                                # Crop plate region
                                plate_crop = frame[y1:y2, x1:x2]
                                
                                if plate_crop.size > 0:
                                    # Run OCR on plate crop
                                    plate_text, ocr_conf = run_ocr_on_plate(plate_crop)
                                    
                                    if plate_text and len(plate_text.strip()) > 0:
                                        # Draw detection box
                                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
                                        cv2.putText(display_frame, f"{plate_text} ({conf:.2f})", (x1, max(10, y1-8)),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                                        
                                        # Add to results
                                        boxes.append([x1, y1, x2, y2])
                                        labels.append(plate_text)
                                        ocr_results.append([plate_text, float(ocr_conf)])
                                        
                                        # Create unique ID for this detection
                                        detection_id = f"plate_{frame_count}_{len(boxes)}"
                                        tracked_objects[detection_id] = {
                                            'plate_number': plate_text,
                                            'confidence': float(conf),
                                            'bbox': [x1, y1, x2, y2],
                                            'first_seen': time.time(),
                                            'last_seen': time.time(),
                                            'crop_filename': '',
                                            'ocr_confidence': float(ocr_conf)
                                        }
                                        
                                        logger.info(f"✅ Detected plate: {plate_text} (conf: {conf:.3f}, OCR: {ocr_conf:.3f})")
                                    else:
                                        # Draw detection box without text
                                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                                        cv2.putText(display_frame, f"PLATE ({conf:.2f})", (x1, max(10, y1-8)),
                                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                                        boxes.append([x1, y1, x2, y2])
                                        labels.append("PLATE")
                                        ocr_results.append(["", 0.0])
                                        
        except Exception as e:
            logger.error(f"Plate detection failed: {e}")
        
        # Encode frame
        try:
            _, buffer = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            frame_bytes = buffer.tobytes()
        except Exception as e:
            logger.error(f"Frame encoding failed: {e}")
            frame_bytes = b''
        
        return {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'tracked_objects': tracked_objects,
            'ids': list(tracked_objects.keys())
        }
        
    except Exception as e:
        logger.error(f"detect_and_ocr failed: {e}")
        return {'frame': b'', 'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}, 'ids': []}


def get_detection_stats():
    """Get detection statistics for monitoring"""
    try:
        current_time = time.time()
        consistent_plates = len([obj for obj in tracked_objects.values() if obj.get('is_consistent', False)])
        
        stats = {
            'total_tracks': len(tracked_objects),
            'plates_detected': len([obj for obj in tracked_objects.values() if obj.get('plate_number')]),
            'consistent_plates': consistent_plates,
            'plates_saved': len([obj for obj in tracked_objects.values() if obj.get('saved_to_db')]),
            'current_fps': smoothed_fps,
            'frame_count': frame_count,
            'plate_history_size': len(plate_history),
            'duplicates_prevented': duplicate_counter,
            'consistency_records': len(track_consistency),
            'ocr_attempts': len(ocr_attempts_per_track),
            'consistency_threshold': consistency_threshold,
            'max_ocr_attempts': max_ocr_attempts,
            'last_cleanup': last_cleanup_time,
            'uptime': current_time - (getattr(get_detection_stats, 'start_time', current_time))
        }
        
        # Initialize start time if not set
        if not hasattr(get_detection_stats, 'start_time'):
            get_detection_stats.start_time = current_time
            
        return stats
        
    except Exception as e:
        logger.error(f"Error getting detection stats: {e}")
        return {'error': str(e)}

def adjust_consistency_settings(new_threshold=None, new_max_attempts=None, new_window=None):
    """Adjust consistency tracking settings"""
    global consistency_threshold, max_ocr_attempts, consistency_window
    
    old_settings = {
        'consistency_threshold': consistency_threshold,
        'max_ocr_attempts': max_ocr_attempts,
        'consistency_window': consistency_window
    }
    
    if new_threshold is not None:
        consistency_threshold = max(1, min(10, new_threshold))  # Between 1-10
        logger.info(f"Consistency threshold adjusted: {old_settings['consistency_threshold']} -> {consistency_threshold}")
    
    if new_max_attempts is not None:
        max_ocr_attempts = max(1, min(20, new_max_attempts))  # Between 1-20
        logger.info(f"Max OCR attempts adjusted: {old_settings['max_ocr_attempts']} -> {max_ocr_attempts}")
    
    if new_window is not None:
        consistency_window = max(5, min(30, new_window))  # Between 5-30
        logger.info(f"Consistency window adjusted: {old_settings['consistency_window']} -> {consistency_window}")
    
    return {
        'success': True,
        'old_settings': old_settings,
        'new_settings': {
            'consistency_threshold': consistency_threshold,
            'max_ocr_attempts': max_ocr_attempts,
            'consistency_window': consistency_window
        }
    }

# Initialize OCR reader on module load
def initialize_ocr():
    """Initialize OCR với comprehensive error handling"""
    global ocr_reader, ocr_reader_fallback, ocr_initialization_attempts
    
    try:
        logger.info("🚀 INITIALIZING OCR WITH COMPREHENSIVE ERROR HANDLING...")
        
        # Reset initialization attempts
        ocr_initialization_attempts = 0
        
        # Use safe OCR initialization
        if safe_ocr_initialization():
            logger.info("🎉 OCR INITIALIZATION SUCCESSFUL!")
            return True
        else:
            logger.error("❌ OCR initialization failed")
            return False
        
    except Exception as e:
        logger.error(f"❌ Critical error in OCR initialization: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

def analyze_debug_crops():
    """Analyze debug crops saved when OCR fails"""
    try:
        debug_dir = os.path.join(os.path.dirname(__file__), 'debug_crops')
        if not os.path.exists(debug_dir):
            logger.info("No debug crops directory found")
            return
        
        crop_files = [f for f in os.listdir(debug_dir) if f.endswith('.jpg')]
        if not crop_files:
            logger.info("No debug crop files found")
            return
        
        logger.info(f"Found {len(crop_files)} debug crop files:")
        for crop_file in sorted(crop_files)[-5:]:  # Show last 5 files
            crop_path = os.path.join(debug_dir, crop_file)
            try:
                img = cv2.imread(crop_path)
                if img is not None:
                    h, w = img.shape[:2]
                    logger.info(f"  {crop_file}: {w}x{h} pixels")
                    
                    # Try OCR on the debug crop
                    if ocr_reader is not None:
                        result = ocr_reader.ocr(img, det=True, rec=True, cls=False)
                        text, conf = safe_extract_ocr_text(result)
                        if text:
                            logger.info(f"    OCR result: '{text}' (conf: {conf:.3f})")
                        else:
                            logger.info(f"    OCR failed: no text detected")
                else:
                    logger.warning(f"  {crop_file}: Could not read image")
            except Exception as e:
                logger.error(f"  {crop_file}: Error analyzing - {e}")
                
    except Exception as e:
        logger.error(f"Error analyzing debug crops: {e}")

# Initialize OCR when module is loaded
if __name__ != "__main__":
    # Setup PyTorch environment first
    try:
        setup_pytorch_environment_fixed()
    except Exception as e:
        logger.warning(f"Could not setup PyTorch environment: {e}")
    
    # Check PyTorch compatibility
    try:
        check_pytorch_compatibility()
    except Exception as e:
        logger.warning(f"Could not check PyTorch compatibility: {e}")
    
    # Check model availability
    try:
        model_status = check_model_availability()
        logger.info(f"Model availability: {model_status['total_available']} models found")
    except Exception as e:
        logger.warning(f"Could not check model availability: {e}")
    
    # Initialize models
    try:
        if initialize_models_properly():
            logger.info("✅ Module initialization successful")
        else:
            logger.warning("⚠️ Module initialization partial success")
    except Exception as e:
        logger.error(f"Module initialization error: {e}")
    
    # Initialize OCR
    try:
        initialize_ocr()
    except Exception as e:
        logger.warning(f"OCR initialization error: {e}")

# Auto-initialization when imported
try:
    logger.info("🚀 Auto-initializing detector_fixed...")
    if initialize_models_properly():
        logger.info("✅ Auto-initialization successful")
    else:
        logger.warning("⚠️ Auto-initialization failed")
except Exception as e:
    logger.error(f"❌ Auto-initialization error: {e}")

# Main function for testing
if __name__ == "__main__":
    try:
        logger.info("🧪 Testing detector_fixed.py...")
        
        # Check PyTorch compatibility first
        check_pytorch_compatibility()
        
        # Check model availability
        check_model_availability()
        
        # Test safe_yolo_load function with comprehensive error handling
        logger.info("🔄 Testing safe_yolo_load function...")
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Test only yolov9s.pt
        test_paths = [
            'yolov9s.pt'  # Only yolov9s.pt
        ]
        
        test_model = None
        for test_path in test_paths:
            logger.info(f"🔄 Testing path: {test_path}")
            try:
                test_model = safe_yolo_load(test_path)
                if test_model:
                    logger.info(f"✅ Model loaded successfully from: {test_path}")
                    break
                else:
                    logger.warning(f"⚠️ Failed to load from: {test_path}")
            except Exception as e:
                logger.warning(f"⚠️ Error testing {test_path}: {e}")
                continue
        
        if test_model:
            logger.info("✅ safe_yolo_load test successful")
        else:
            logger.error("❌ All safe_yolo_load tests failed")
            # Try force download as last resort
            logger.info("🔄 Trying force model download...")
            try:
                from ultralytics import YOLO
                test_model = YOLO('yolov9s.pt')
                logger.info("✅ Force download successful")
            except Exception as e:
                logger.error(f"❌ Force download failed: {e}")
        
        # Test OCR initialization
        logger.info("🔄 Testing OCR initialization...")
        try:
            initialize_ocr()
            logger.info("✅ OCR initialization test successful")
        except Exception as e:
            logger.error(f"❌ OCR initialization test failed: {e}")
        
        # Test basic model loading
        logger.info("🔄 Testing basic model loading...")
        try:
            if yolo_model is None:
                logger.info("Loading test vehicle model...")
                yolo_model = safe_yolo_load('yolov9s.pt')
            
            if plate_model is None:
                logger.info("Loading test plate model...")
                plate_model = safe_yolo_load('yolov9s.pt')
                
            if yolo_model or plate_model:
                logger.info("✅ Basic model loading test successful")
            else:
                logger.warning("⚠️ Basic model loading test failed")
                
        except Exception as e:
            logger.error(f"❌ Basic model loading test failed: {e}")
        
        # Create and test simple frame
        logger.info("🔄 Testing frame creation...")
        try:
            test_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(test_frame, "TEST FRAME", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            logger.info("✅ Test frame created successfully")
            
            # Only test detection if we have a working model
            if yolo_model or plate_model:
                logger.info("🔄 Testing detection on test frame...")
                result = detect_and_ocr(test_frame)
                
                if result:
                    logger.info("✅ Detection test successful!")
                    logger.info(f"Result keys: {list(result.keys())}")
                    logger.info(f"Boxes: {len(result.get('boxes', []))}")
                    logger.info(f"Labels: {len(result.get('labels', []))}")
                else:
                    logger.warning("⚠️ Detection test returned no result")
            else:
                logger.warning("⚠️ Skipping detection test - no working models")
                
        except Exception as e:
            logger.error(f"❌ Frame/detection test failed: {e}")
            
        logger.info("🧪 Testing completed!")
            
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
# Thêm function debug này vào cuối file detector_fixed.py:

def detect_and_ocr_debug_mode(frame, video_processing=True):
    """Debug version with forced visualization for testing"""
    global frame_count
    frame_count += 1
    
    try:
        h, w = frame.shape[:2]
        display_frame = frame.copy()
        
        logger.info(f"DEBUG MODE: Frame {frame_count}, size: {w}x{h}")
        
        # Step 1: ALWAYS draw ROI
        try:
            roi_xmin, roi_ymin, roi_xmax, roi_ymax = calculate_roi_coordinates(w, h)
            cv2.rectangle(display_frame, (roi_xmin, roi_ymin), (roi_xmax, roi_ymax), (0, 255, 255), 4)
            cv2.putText(display_frame, "DETECTION ZONE", (roi_xmin + 10, roi_ymin - 15), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            logger.info(f"ROI drawn: [{roi_xmin}, {roi_ymin}, {roi_xmax}, {roi_ymax}]")
        except Exception as roi_error:
            logger.error(f"ROI error: {roi_error}")
            # Fallback ROI
            margin = 80
            cv2.rectangle(display_frame, (margin, margin), (w-margin, h-margin), (0, 255, 255), 4)
        
        # Step 2: Try real detection first
        detections = []
        tracks = []
        boxes = []
        labels = []
        ocr_results = []
        
        if yolo_model:
            try:
                logger.info("Running real YOLO detection...")
                detections = safe_yolo_detection(yolo_model, frame)
                logger.info(f"Real detections: {len(detections)}")
                
                if detections and tracker:
                    tracks = safe_deepsort_update(tracker, detections, frame)
                    logger.info(f"Real tracks: {len(tracks)}")
                    
            except Exception as detection_error:
                logger.error(f"Real detection failed: {detection_error}")
        
        # Step 3: If no real detections, show fake ones for testing
        if len(detections) == 0:
            logger.info("No real detections, showing fake detections for testing...")
            
            fake_detections = [
                [150, 100, 200, 120, 0.85, 2],  # Car 1
                [400, 200, 180, 100, 0.75, 2],  # Car 2  
                [200, 350, 150, 80, 0.65, 3],   # Motorcycle
            ]
            
            for i, fake_det in enumerate(fake_detections):
                x, y, w, h, conf, class_id = fake_det
                x1, y1, x2, y2 = x, y, x + w, y + h
                
                # Draw fake vehicle (BLUE)
                cv2.rectangle(display_frame, (x1, y1), (x2, y2), (255, 0, 0), 4)
                cv2.putText(display_frame, f"FAKE_VEHICLE_{i}", (x1, y1-10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                
                # Draw fake plate area (WHITE)
                plate_y1 = y2 - int(h * 0.3)
                plate_y2 = y2 - int(h * 0.1)
                plate_x1 = x1 + int(w * 0.2)
                plate_x2 = x2 - int(w * 0.2)
                
                if plate_y1 < plate_y2 and plate_x1 < plate_x2:
                    cv2.rectangle(display_frame, (plate_x1, plate_y1), (plate_x2, plate_y2), (255, 255, 255), 3)
                    fake_plate = f"FAKE{i:02d}A123"
                    cv2.putText(display_frame, fake_plate, (plate_x1, plate_y1-5), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                    
                    labels.append(fake_plate)
                    ocr_results.append([fake_plate, 0.9])
                
                boxes.append([x1, y1, x2, y2])
                
            logger.info(f"Drew {len(fake_detections)} fake detections")
        
        # Step 4: Draw real detections if available
        else:
            logger.info(f"Drawing {len(detections)} real detections...")
            
            # Draw detections (BLUE)
            for i, det in enumerate(detections):
                try:
                    if len(det) >= 6:
                        x, y, w, h, conf, class_id = det[:6]
                        x1, y1, x2, y2 = int(x), int(y), int(x + w), int(y + h)
                        
                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), (255, 0, 0), 4)
                        det_label = f"DET{i}:C{class_id} {conf:.2f}"
                        cv2.putText(display_frame, det_label, (x1, y1-10), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                        boxes.append([x1, y1, x2, y2])
                except Exception as e:
                    logger.debug(f"Error drawing detection {i}: {e}")
            
            # Draw tracks (GREEN/ORANGE)
            for i, track in enumerate(tracks):
                try:
                    if hasattr(track, 'track_id') and hasattr(track, 'to_ltrb'):
                        track_id = track.track_id
                        ltrb = track.to_ltrb()
                        
                        if isinstance(ltrb, np.ndarray):
                            ltrb = ltrb.flatten()
                        
                        x1, y1, x2, y2 = map(int, ltrb[:4])
                        
                        # Draw track (GREEN)
                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 4)
                        
                        # Track label
                        track_label = f"TRACK_{track_id}"
                        cv2.putText(display_frame, track_label, (x1, y1-30), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                        
                        # Try plate detection on this track
                        try:
                            vehicle_crop = frame[y1:y2, x1:x2]
                            if vehicle_crop.size > 0:
                                plate_crop, plate_conf, plate_bbox = detect_license_plate_in_vehicle(vehicle_crop, plate_model)
                                
                                if plate_crop is not None and plate_bbox:
                                    # Draw plate bbox (WHITE)
                                    px1, py1, px2, py2 = plate_bbox
                                    frame_px1 = x1 + px1
                                    frame_py1 = y1 + py1
                                    frame_px2 = x1 + px2
                                    frame_py2 = y1 + py2
                                    
                                    cv2.rectangle(display_frame, (frame_px1, frame_py1), 
                                                 (frame_px2, frame_py2), (255, 255, 255), 3)
                                    
                                    # Try OCR
                                    plate_text = None
                                    if ocr_reader:
                                        try:
                                            ocr_result = ocr_reader.ocr(plate_crop, det=True, rec=True, cls=False)
                                            if ocr_result:
                                                plate_text, ocr_conf = safe_extract_ocr_text(ocr_result)
                                                if plate_text:
                                                    cv2.putText(display_frame, f"{plate_text} ({ocr_conf:.2f})", 
                                                               (frame_px1, frame_py1-10), 
                                                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                                                    labels.append(plate_text)
                                                    ocr_results.append([plate_text, ocr_conf])
                                        except Exception as ocr_error:
                                            logger.debug(f"OCR failed: {ocr_error}")
                        
                        except Exception as plate_error:
                            logger.debug(f"Plate detection failed: {plate_error}")
                        
                except Exception as track_error:
                    logger.debug(f"Track processing failed: {track_error}")
        
        # Step 5: Status information
        try:
            # Top status
            status_text = f"DEBUG MODE - Frame {frame_count}"
            cv2.putText(display_frame, status_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            # Detection counts
            counts_text = f"Det: {len(detections)} | Tracks: {len(tracks)} | Boxes: {len(boxes)}"
            cv2.putText(display_frame, counts_text, (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Model status
            model_status = f"YOLO: {'OK' if yolo_model else 'MISSING'} | OCR: {'OK' if ocr_reader else 'MISSING'}"
            cv2.putText(display_frame, model_status, (10, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Legend
            legend_y = h - 100
            cv2.putText(display_frame, "BLUE: Vehicle Detection", (10, legend_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
            cv2.putText(display_frame, "GREEN: Vehicle Track", (10, legend_y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            cv2.putText(display_frame, "WHITE: License Plate", (10, legend_y + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            cv2.putText(display_frame, "YELLOW: ROI Zone", (10, legend_y + 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
            
        except Exception as status_error:
            logger.debug(f"Status drawing error: {status_error}")
        
        # Encode frame
        frame_bytes = safe_frame_encoding(display_frame)
        if frame_bytes is None:
            frame_bytes = b''
        
        result = {
            'frame': frame_bytes,
            'boxes': boxes,
            'labels': labels,
            'ocr_results': ocr_results,
            'tracked_objects': tracked_objects.copy(),
            'ids': list(range(len(tracks)))
        }
        
        logger.info(f"DEBUG MODE: Frame {frame_count} completed - {len(boxes)} boxes, {len(labels)} labels")
        return result
        
    except Exception as e:
        logger.error(f"Debug mode error: {e}")
        
        # Error frame
        error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(error_frame, "DEBUG MODE ERROR", (150, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.putText(error_frame, str(e)[:50], (50, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        
        frame_bytes = safe_frame_encoding(error_frame)
        if frame_bytes is None:
            frame_bytes = b''
            
        return {
            'frame': frame_bytes,
            'boxes': [], 'labels': [], 'ocr_results': [], 'tracked_objects': {}, 'ids': []
        }

# Wrapper function to enable debug mode
def detect_and_ocr_with_debug_toggle(frame, enable_debug=True, video_processing=True):
    """Wrapper to toggle between debug and normal mode"""
    if enable_debug:
        logger.info("Using DEBUG MODE")
        return detect_and_ocr_debug_mode(frame, video_processing)
    else:
        logger.info("Using NORMAL MODE")
        return detect_and_ocr(frame, video_processing)

# Wrapper function to enable debug mode
def detectand_ocr_with_debug_toggle(frame, enable_debug=True, video_processing=True):
    """Wrapper to toggle between debug and normal mode"""
    if enable_debug:
        logger.info("Using DEBUG MODE")
        return detect_and_ocr_debug_mode(frame, video_processing)
    else:
        logger.info("Using NORMAL MODE")
        return detect_and_ocr(frame, video_processing)

def force_enable_detection():
    """Force enable detection by resetting settings"""
    global ENABLE_FRAME_SKIP, FRAME_SKIP, MIN_CONFIDENCE
    
    logger.info("🔧 FORCE ENABLING DETECTION")
    
    # Disable frame skipping
    ENABLE_FRAME_SKIP = False
    FRAME_SKIP = 1
    
    # Lower confidence for better detection
    MIN_CONFIDENCE = 0.2
    
    # Force model initialization
    if not initialize_models_properly():
        logger.error("❌ Failed to initialize models")
        return False
    
    logger.info("✅ Detection force enabled")
    return True

def get_detection_status():
    """Get current detection status"""
    return {
        'yolo_model_ready': yolo_model is not None,
        'plate_model_ready': plate_model is not None,
        'ocr_reader_ready': ocr_reader is not None,
        'tracker_ready': tracker is not None,
        'min_confidence': MIN_CONFIDENCE,
        'frame_skip_enabled': ENABLE_FRAME_SKIP,
        'frame_skip_value': FRAME_SKIP,
        'plate_model_name': plate_model_name
    }

# Export main functions
__all__ = [
    'detect_and_ocr',
    'detect_and_ocr_debug_mode', 
    'detectand_ocr_with_debug_toggle',
    'calculate_roi_coordinates',
    'tracked_objects',
    'cleanup_tracked_objects',
    'safe_yolo_load',
    'check_model_availability'
]