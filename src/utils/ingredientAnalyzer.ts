import { Ingredient } from '../types/ingredient';
import * as cheerio from 'cheerio';

const fetchEWGData = async (ingredient: string): Promise<Partial<Ingredient> | null> => {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ewg-search`;
    const response = await fetch(`${apiUrl}?ingredient=${encodeURIComponent(ingredient)}`, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch EWG data for ${ingredient}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.warn(`EWG data error for ${ingredient}: ${data.error}`);
      return null;
    }

    const $ = cheerio.load(data.html);

    const firstResult = $('.product-listing').first();
    if (!firstResult.length) {
      console.warn(`No EWG data found for ${ingredient}`);
      return null;
    }

    const score = parseInt(firstResult.find('.product-hazard-score').text().trim()) || 5;
    const concerns = firstResult.find('.product-hazards li')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(', ');

    return {
      ewgScore: score,
      safetyLevel: getSafetyLevel(score),
      reasonForConcern: concerns || getDefaultConcern(score),
      function: getIngredientFunction(ingredient),
      commonUse: getCommonUse(ingredient)
    };
  } catch (error) {
    console.warn(`Error fetching EWG data for ${ingredient}:`, error);
    return null;
  }
};

const getSafetyLevel = (score: number): string => {
  if (score <= 2) return 'Low Concern';
  if (score <= 6) return 'Moderate Concern';
  return 'High Concern';
};

const getDefaultConcern = (score: number): string => {
  if (score <= 2) return 'Generally recognized as safe';
  if (score <= 6) return 'Moderate safety concerns, more research needed';
  return 'High safety concerns, potential health risks';
};

const getIngredientFunction = (ingredient: string): string => {
  // Enhanced ingredient function detection
  const functions: { [key: string]: string[] } = {
    'Preservative': ['paraben', 'phenoxyethanol', 'benzoate', 'sorbate'],
    'Surfactant': ['lauryl', 'laureth', 'sodium', 'cocamide'],
    'Emollient': ['oil', 'butter', 'glycerin', 'lanolin'],
    'Fragrance': ['fragrance', 'parfum', 'aroma'],
    'UV Filter': ['benzophenone', 'avobenzone', 'titanium dioxide'],
    'Antioxidant': ['tocopherol', 'vitamin', 'retinol'],
    'Humectant': ['glycerin', 'hyaluronic', 'urea'],
    'Emulsifier': ['cetyl', 'stearic', 'glyceryl']
  };

  const lowerIngredient = ingredient.toLowerCase();
  for (const [func, keywords] of Object.entries(functions)) {
    if (keywords.some(keyword => lowerIngredient.includes(keyword))) {
      return func;
    }
  }

  return 'Other/Unknown';
};

const getCommonUse = (ingredient: string): string => {
  // Enhanced common use detection
  const uses: { [key: string]: string[] } = {
    'Moisturizing agent': ['glycerin', 'oil', 'butter', 'hyaluronic'],
    'Cleansing agent': ['lauryl', 'laureth', 'cocamide'],
    'Preservative system': ['paraben', 'phenoxyethanol', 'benzoate'],
    'Fragrance component': ['fragrance', 'parfum', 'aroma'],
    'Sun protection': ['benzophenone', 'avobenzone', 'titanium'],
    'Antioxidant protection': ['tocopherol', 'vitamin', 'retinol']
  };

  const lowerIngredient = ingredient.toLowerCase();
  for (const [use, keywords] of Object.entries(uses)) {
    if (keywords.some(keyword => lowerIngredient.includes(keyword))) {
      return use;
    }
  }

  return 'Various applications';
};

export const analyzeIngredients = async (ingredientList: string): Promise<Ingredient[]> => {
  const ingredientsArray = ingredientList
    .toLowerCase()
    .split(/[,;\n]+/)
    .map(item => item.trim())
    .filter(item => item && item.length > 1);

  const analyzedIngredients: Ingredient[] = [];

  for (const name of ingredientsArray) {
    const ewgData = await fetchEWGData(name);
    
    analyzedIngredients.push({
      name: name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      function: ewgData?.function || getIngredientFunction(name),
      ewgScore: ewgData?.ewgScore || 5,
      safetyLevel: ewgData?.safetyLevel || 'Moderate Concern',
      reasonForConcern: ewgData?.reasonForConcern || 'Limited safety data available',
      commonUse: ewgData?.commonUse || getCommonUse(name)
    });
  }

  return analyzedIngredients;
};