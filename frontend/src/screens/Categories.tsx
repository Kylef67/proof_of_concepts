import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import DateRangePicker, { DateRangeSelection } from '../components/DateRangePicker';
import CategoryForm from './CategoryForm';
import CategoryDetails from './CategoryDetails';
import { useData, Category } from '../contexts/DataContext';

export default function Categories() {
  const { 
    categories, 
    addCategory, 
    updateCategory, 
    loading, 
    error, 
    isInitialized 
  } = useData();

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);
  
  const totalExpenses = categories
    .filter(cat => cat.type === 'Expense')
    .reduce((sum, category) => sum + (category.amount || 0), 0);
  
  // Get categories with transactions this month
  const activeCategories = categories.filter(cat => (cat.amount || 0) > 0 || (cat.transactionCount || 0) > 0);
  
  // Format currency to ₱ X,XXX
  const formatCurrency = (amount: number) => {
    if (amount === 0) return '₱ 0';
    return `₱ ${amount.toLocaleString('en-PH')}`;
  };

  const handlePresentModal = () => {
    setSelectedCategory(null);
    setShowCategoryForm(true);
  };

  const handleSaveCategory = async (categoryData: any) => {
    try {
      if (categoryData.id) {
        // Update existing category
        await updateCategory({ ...categoryData });
      } else {
        // Add new category
        const newCategory: Category = {
          ...categoryData,
          id: Date.now().toString(), // Temporary ID, backend will assign real one
          amount: 0,
          transactionCount: 0,
        };
        await addCategory(newCategory);
      }
      
      setShowCategoryForm(false);
      setSelectedCategory(null);
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  // Smart category click behavior
  const handleCategoryPress = (category: Category) => {
    setSelectedCategory(category);
    setShowCategoryDetails(true);
  };

  const handleBackFromDetails = () => {
    setShowCategoryDetails(false);
    setSelectedCategory(null);
  };

  // Calculate the width of each category item based on screen width
  const screenWidth = Dimensions.get('window').width;
  const itemWidth = (screenWidth - 48) / 4; // 4 items per row with more padding

  // Enhanced donut chart component to match the image
  const DonutChart = () => {
    return (
      <View style={styles.chartContainer}>
        {/* Enhanced donut chart */}
        <View style={styles.donutChart}>
          {/* Pink segment (major part) */}
          <View style={styles.pinkSegment} />
          {/* Blue segment (small part) */}
          <View style={styles.blueSegment} />
        </View>
        
        {/* Center content */}
        <View style={styles.chartContent}>
          <Text style={styles.expensesTitle}>Expenses</Text>
          <Text style={styles.expensesAmount}>₱ {Math.abs(totalExpenses).toLocaleString('en-PH')}</Text>
          <Text style={styles.expensesBalance}>₱ 0</Text>
        </View>
      </View>
    );
  };

  if (showCategoryDetails && selectedCategory) {
    return (
      <CategoryDetails 
        category={selectedCategory}
        onBack={handleBackFromDetails}
      />
    );
  }

  if (showCategoryForm) {
    return (
      <CategoryForm 
        category={selectedCategory ? {
          id: selectedCategory.id,
          name: selectedCategory.name,
          type: selectedCategory.type || 'Expense',
          icon: selectedCategory.icon,
          color: selectedCategory.color,
        } : undefined}
        onSave={handleSaveCategory}
        onCancel={() => {
          setShowCategoryForm(false);
          setSelectedCategory(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.profileButton}>
          <MaterialCommunityIcons name="account-circle-outline" size={28} color="#8E8E93" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>All accounts</Text>
          <Text style={styles.headerBalance}>₱ 213,827</Text>
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        ) : (
          <View style={styles.dashboardContainer}>
            {/* First row of categories */}
            <View style={styles.categoryRow}>
              {categories.slice(0, 4).map((category) => {
                
                return (
                  <TouchableOpacity 
                    key={category.id} 
                    style={styles.categoryItem}
                    onPress={() => handleCategoryPress(category)}
                  >
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryAmount}>{formatCurrency(category.amount || 0)}</Text>
                    
                    <View style={[styles.iconContainer, { backgroundColor: category.color }]}>
                      <MaterialCommunityIcons 
                        name={category.icon as any} 
                        size={32} 
                        color="#FFF" 
                      />
                    </View>
                    
                    <Text style={styles.categoryAmountLarge}>{formatCurrency(category.amount || 0)}</Text>
                    
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Second row of categories */}
            <View style={styles.categoryRow}>
              {categories.slice(4, 8).map((category) => {
                const hasActivity = (category.transactions?.all.count || 0) > 0 || 
                                  (category.subcategories?.length || 0) > 0;
                
                return (
                  <TouchableOpacity 
                    key={category.id} 
                    style={styles.categoryItem}
                    onPress={() => handleCategoryPress(category)}
                  >
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryAmount}>{formatCurrency(category.amount || 0)}</Text>
                    
                    <View style={[styles.iconContainer, { backgroundColor: category.color }]}>
                      <MaterialCommunityIcons 
                        name={category.icon as any} 
                        size={32} 
                        color="#FFF" 
                      />
                    </View>
                    
                    <Text style={styles.categoryAmountLarge}>{formatCurrency(category.amount || 0)}</Text>
                    
                    {/* Activity indicator */}
                    {hasActivity && (
                      <View style={styles.activityIndicator}>
                        <View style={styles.activityDot} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Third row of categories */}
            <View style={styles.categoryRow}>
              {categories.slice(8, 12).map((category) => {
                const hasActivity = (category.transactions?.all.count || 0) > 0 || 
                                  (category.subcategories?.length || 0) > 0;
                
                return (
                  <TouchableOpacity 
                    key={category.id} 
                    style={styles.categoryItem}
                    onPress={() => handleCategoryPress(category)}
                  >
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryAmount}>{formatCurrency(category.amount || 0)}</Text>
                    
                    <View style={[styles.iconContainer, { backgroundColor: category.color }]}>
                      <MaterialCommunityIcons 
                        name={category.icon as any} 
                        size={32} 
                        color="#FFF" 
                      />
                    </View>
                    
                    <Text style={styles.categoryAmountLarge}>{formatCurrency(category.amount || 0)}</Text>
                    
                    {/* Activity indicator */}
                    {hasActivity && (
                      <View style={styles.activityIndicator}>
                        <View style={styles.activityDot} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Remaining categories if any */}
            {categories.length > 12 && (
              <View style={styles.remainingCategories}>
                {categories.slice(12).map((category) => {
                  const hasActivity = (category.transactions?.all.count || 0) > 0 || 
                                    (category.subcategories?.length || 0) > 0;
                  
                  return (
                    <TouchableOpacity 
                      key={category.id} 
                      style={styles.categoryItem}
                      onPress={() => handleCategoryPress(category)}
                    >
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryAmount}>{formatCurrency(category.amount || 0)}</Text>
                      
                      <View style={[styles.iconContainer, { backgroundColor: category.color }]}>
                        <MaterialCommunityIcons 
                          name={category.icon as any} 
                          size={32} 
                          color="#FFF" 
                        />
                      </View>
                      
                      <Text style={styles.categoryAmountLarge}>{formatCurrency(category.amount || 0)}</Text>
                      
                      {/* Activity indicator */}
                      {hasActivity && (
                        <View style={styles.activityIndicator}>
                          <View style={styles.activityDot} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
            {/* Floating Add Button */}
      <TouchableOpacity style={styles.floatingButton} onPress={handlePresentModal}>
        <MaterialCommunityIcons name="plus" size={28} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerBalance: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 12,
    color: '#FF4B8C',
    textAlign: 'center',
    marginTop: 4,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  dashboardContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  categoryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 4,
    position: 'relative',
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
    height: 16,
  },
  categoryAmount: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryAmountLarge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  activityIndicator: {
    position: 'absolute',
    top: 28,
    right: 8,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  chartContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
    position: 'relative',
  },
  donutChart: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E6427B',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pinkSegment: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E6427B',
    position: 'absolute',
  },
  blueSegment: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1C1C1E',
    position: 'absolute',
  },
  chartContent: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
  },
  expensesTitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  expensesAmount: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E6427B',
    marginBottom: 2,
  },
  expensesBalance: {
    fontSize: 12,
    color: '#4CAF50',
  },
  remainingCategories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6B8AFE',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
}); 